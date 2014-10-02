/*!
 website-src 

Build: 
----------
Version: 0.0.4
Timestamp: Thu Oct 02 2014 15:17:10 
----------*//*!
 * viewport-units-buggyfill v0.4.1
 * @web: https://github.com/rodneyrehm/viewport-units-buggyfill/
 * @author: Rodney Rehm - http://rodneyrehm.de/en/
 */

(function (root, factory) {
  'use strict';
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define([], factory);
  } else if (typeof exports === 'object') {
    // Node. Does not work with strict CommonJS, but
    // only CommonJS-like enviroments that support module.exports,
    // like Node.
    module.exports = factory();
  } else {
    // Browser globals (root is window)
    root.viewportUnitsBuggyfill = factory();
  }
}(this, function () {
  'use strict';
  /*global document, window, location, XMLHttpRequest, XDomainRequest*/

  var initialized = false;
  var options;
  var isMobileSafari = /(iPhone|iPod|iPad).+AppleWebKit/i.test(window.navigator.userAgent);
  var viewportUnitExpression = /([+-]?[0-9.]+)(vh|vw|vmin|vmax)/g;
  var forEach = [].forEach;
  var dimensions;
  var declarations;
  var styleNode;
  var isOldInternetExplorer = false;

  // Do not remove the following comment!
  // It is a conditional comment used to
  // identify old Internet Explorer versions

  /*@cc_on

  @if (@_jscript_version <= 10)
    isOldInternetExplorer = true;
  @end

  @*/

  function debounce(func, wait) {
    var timeout;
    return function() {
      var context = this;
      var args = arguments;
      var callback = function() {
        func.apply(context, args);
      };

      clearTimeout(timeout);
      timeout = setTimeout(callback, wait);
    };
  }

  // from http://stackoverflow.com/questions/326069/how-to-identify-if-a-webpage-is-being-loaded-inside-an-iframe-or-directly-into-t
  function inIframe() {
    try {
      return window.self !== window.top;
    } catch (e) {
      return true;
    }
  }

  function initialize(initOptions) {
    if (initialized) {
      return;
    }

    if (initOptions === true) {
      initOptions = {
        force: true
      };
    }

    options = initOptions || {};
    options.isMobileSafari = isMobileSafari;

    if (!options.force && !isMobileSafari && !isOldInternetExplorer && (!options.hacks || !options.hacks.required(options))) {
      // this buggyfill only applies to mobile safari
      return;
    }

    options.hacks && options.hacks.initialize(options);

    initialized = true;
    styleNode = document.createElement('style');
    styleNode.id = 'patched-viewport';
    document.head.appendChild(styleNode);

    // Issue #6: Cross Origin Stylesheets are not accessible through CSSOM,
    // therefore download and inject them as <style> to circumvent SOP.
    importCrossOriginLinks(function() {
      var _refresh = debounce(refresh, options.refreshDebounceWait || 100);
      // doing a full refresh rather than updateStyles because an orientationchange
      // could activate different stylesheets
      window.addEventListener('orientationchange', _refresh, true);
      // orientationchange might have happened while in a different window
      window.addEventListener('pageshow', _refresh, true);

      if (options.force || isOldInternetExplorer || inIframe()) {
        window.addEventListener('resize', _refresh, true);
        options._listeningToResize = true;
      }

      options.hacks && options.hacks.initializeEvents(options, refresh, _refresh);

      refresh();
    });
  }

  function updateStyles() {
    styleNode.textContent = getReplacedViewportUnits();
  }

  function refresh() {
    if (!initialized) {
      return;
    }

    findProperties();

    // iOS Safari will report window.innerWidth and .innerHeight as 0
    // unless a timeout is used here.
    // TODO: figure out WHY innerWidth === 0
    setTimeout(function() {
      updateStyles();
    }, 1);
  }

  function findProperties() {
    declarations = [];
    forEach.call(document.styleSheets, function(sheet) {
      if (sheet.ownerNode.id === 'patched-viewport' || !sheet.cssRules) {
        // skip entire sheet because no rules ara present or it's the target-element of the buggyfill
        return;
      }

      if (sheet.media && sheet.media.mediaText && window.matchMedia && !window.matchMedia(sheet.media.mediaText).matches) {
        // skip entire sheet because media attribute doesn't match
        return;
      }

      forEach.call(sheet.cssRules, findDeclarations);
    });

    return declarations;
  }

  function findDeclarations(rule) {
    if (rule.type === 7) {
      var value = rule.cssText;
      viewportUnitExpression.lastIndex = 0;
      if (viewportUnitExpression.test(value)) {
        // KeyframesRule does not have a CSS-PropertyName
        declarations.push([rule, null, value]);
        options.hacks && options.hacks.findDeclarations(declarations, rule, null, value);
      }

      return;
    }

    if (!rule.style) {
      if (!rule.cssRules) {
        return;
      }

      forEach.call(rule.cssRules, function(_rule) {
        findDeclarations(_rule);
      });

      return;
    }

    forEach.call(rule.style, function(name) {
      var value = rule.style.getPropertyValue(name);
      viewportUnitExpression.lastIndex = 0;
      if (viewportUnitExpression.test(value)) {
        declarations.push([rule, name, value]);
        options.hacks && options.hacks.findDeclarations(declarations, rule, name, value);
      }
    });
  }

  function getReplacedViewportUnits() {
    dimensions = getViewport();

    var css = [];
    var buffer = [];
    var open;
    var close;

    declarations.forEach(function(item) {
      var _item = overwriteDeclaration.apply(null, item);
      var _open = _item.selector.length ? (_item.selector.join(' {\n') + ' {\n') : '';
      var _close = new Array(_item.selector.length + 1).join('\n}');

      if (!_open || _open !== open) {
        if (buffer.length) {
          css.push(open + buffer.join('\n') + close);
          buffer.length = 0;
        }

        if (_open) {
          open = _open;
          close = _close;
          buffer.push(_item.content);
        } else {
          css.push(_item.content);
          open = null;
          close = null;
        }

        return;
      }

      if (_open && !open) {
        open = _open;
        close = _close;
      }

      buffer.push(_item.content);
    });

    if (buffer.length) {
      css.push(open + buffer.join('\n') + close);
    }

    return css.join('\n\n');
  }

  function overwriteDeclaration(rule, name, value) {
    var _value = value.replace(viewportUnitExpression, replaceValues);
    var  _selectors = [];

    if (options.hacks) {
      _value = options.hacks.overwriteDeclaration(rule, name, _value);
    }

    if (name) {
      // skipping KeyframesRule
      _selectors.push(rule.selectorText);
      _value = name + ': ' + _value + ';';
    }

    var _rule = rule.parentRule;
    while (_rule) {
      _selectors.unshift('@media ' + _rule.media.mediaText);
      _rule = _rule.parentRule;
    }

    return {
      selector: _selectors,
      content: _value
    };
  }

  function replaceValues(match, number, unit) {
    var _base = dimensions[unit];
    var _number = parseFloat(number) / 100;
    return (_number * _base) + 'px';
  }

  function getViewport() {
    var vh = window.innerHeight;
    var vw = window.innerWidth;

    return {
      vh: vh,
      vw: vw,
      vmax: Math.max(vw, vh),
      vmin: Math.min(vw, vh)
    };
  }

  function importCrossOriginLinks(next) {
    var _waiting = 0;
    var decrease = function() {
      _waiting--;
      if (!_waiting) {
        next();
      }
    };

    forEach.call(document.styleSheets, function(sheet) {
      if (!sheet.href || origin(sheet.href) === origin(location.href)) {
        // skip <style> and <link> from same origin
        return;
      }

      _waiting++;
      convertLinkToStyle(sheet.ownerNode, decrease);
    });

    if (!_waiting) {
      next();
    }
  }

  function origin(url) {
    return url.slice(0, url.indexOf('/', url.indexOf('://') + 3));
  }

  function convertLinkToStyle(link, next) {
    getCors(link.href, function() {
      var style = document.createElement('style');
      style.media = link.media;
      style.setAttribute('data-href', link.href);
      style.textContent = this.responseText;
      link.parentNode.replaceChild(style, link);
      next();
    }, next);
  }

  function getCors(url, success, error) {
    var xhr = new XMLHttpRequest();
    if ('withCredentials' in xhr) {
      // XHR for Chrome/Firefox/Opera/Safari.
      xhr.open('GET', url, true);
    } else if (typeof XDomainRequest !== 'undefined') {
      // XDomainRequest for IE.
      xhr = new XDomainRequest();
      xhr.open('GET', url);
    } else {
      throw new Error('cross-domain XHR not supported');
    }

    xhr.onload = success;
    xhr.onerror = error;
    xhr.send();
    return xhr;
  }

  return {
    version: '0.4.1',
    findProperties: findProperties,
    getCss: getReplacedViewportUnits,
    init: initialize,
    refresh: refresh
  };

}));

/**
 * Created by paapster on 02/10/14.
 */

var Calendar = function () {
    this.date = new Date();
    this.month = this.date.getMonth();
    this.months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
    this.day = this.date.getDate();
    this.year = this.date.getFullYear();
    this.events = [
        {name: 'Seb Lee', description: 'Sessie als Gastspreker', location: 'Frontmen', year: '2014', month: '4', day: '16'}
    ]

    this.getEvents();
    this.createDates();
    this.initCalendar();

    this.bindMonthChange();
    this.bindEventSelect();
}

Calendar.prototype.createDates = function () {
    for (var i = this.events.length - 1; i >= 0; i--) {
        var ev = this.events[i];
        ev.date = new Date(ev.year, ev.month - 1, ev.day);
    }
    ;
}

Calendar.prototype.populateEventList = function () {
    var evList = document.getElementById('event-list');
    evList.innerHTML = "";
    for (var i = 0; i < this.events.length; i++) {
        if (parseInt(this.events[i].year) === parseInt(this.year) && parseInt(this.events[i].month - 1) === parseInt(this.month)) {
            var evLi = document.createElement('li');
            evList.appendChild(evLi);

            var wrapper = document.createElement('div');

            var evName = document.createElement('h6');
            evName.innerHTML = this.events[i].name;

            var evDescription = document.createElement('p');
            evDescription.innerHTML = this.events[i].description + '<span class="location"> @ ' + this.events[i].location + '</span>';

            var daySpan = document.createElement('a');
            daySpan.classList.add('event')
            daySpan.href = "javascript:void(0)";
            daySpan.innerHTML = this.events[i].day;
            evLi.appendChild(daySpan);
            evLi.appendChild(wrapper);
            wrapper.appendChild(evName);
            wrapper.appendChild(evDescription);
        }
    }
}

Calendar.prototype.initCalendar = function () {
    var y = this.date.getFullYear(), m = this.date.getMonth();
    var firstDay = new Date(y, m, 1);
    var lastDay = new Date(y, m + 1, 0);

    var numberOfWeeks = Math.ceil((firstDay.getDate() + lastDay.getDate()) / 7);

    this.populateEventList();
    this.createElements(numberOfWeeks, firstDay);
    document.getElementById('events-year').innerHTML = this.year;
    document.getElementById('events-month').innerHTML = this.months[this.month];
}

Calendar.prototype.createElements = function (numberOfWeeks, firstDay) {
    var daysEl = document.getElementById('select-days');
    var currentDay = firstDay;

    while (currentDay.getDay() !== 1) {
        currentDay.setDate(currentDay.getDate() - 1);
    }

    daysEl.innerHTML = "";

    for (var i = 0; i < numberOfWeeks; i++) {
        var row = document.createElement('div');
        row.id = 'week-' + (i + 1);
        daysEl.appendChild(row);
        for (var j = 0; j < 7; j++) {
            var link = document.createElement('a');
            link.innerHTML = currentDay.getDate();
            link.href = "javascript:void(0)";
            if (currentDay.getMonth() === this.month) {
                link.classList.add('active');
            }

            for (var k = this.events.length - 1; k >= 0; k--) {
                if (currentDay.getTime() === this.events[k].date.getTime()) {
                    link.classList.add('event');
                }
            }
            ;

            row.appendChild(link);
            currentDay.setDate(currentDay.getDate() + 1);
        }
    }
    ;
}

Calendar.prototype.getEvents = function () {
    $.get("http://localhost:3000/api/events", function (data) {
        console.log(data);
    });
}

Calendar.prototype.bindEventSelect = function (e) {
    $('.event').on('click', function (e) {
        document.getElementById('selected-day').innerHTML = e.currentTarget.innerHTML;
        document.getElementById('selected-month').innerHTML = this.months[this.month];
        document.getElementById('selected-year').innerHTML = this.year;

        for (var i = 0; i < this.events.length; i++) {
            if (parseInt(this.events[i].year) === parseInt(this.year) && parseInt(this.events[i].month - 1) === parseInt(this.month)) {
                if (parseInt(e.currentTarget.innerHTML) === parseInt(this.events[i].day)) {
                    document.getElementById('event-details-name').innerHTML = this.events[i].name
                    document.getElementById('event-details-description').innerHTML = this.events[i].description
                    var span = document.createElement('span');
                    span.id = 'event-details-location';
                    span.innerHTML = this.events[i].location;
                    span.classList.add('location')
                    document.getElementById('event-details-description').appendChild(span);
                    break;
                }
            }
        }

        $("#events-contact-form").css('height', 'auto');
        $('html,body').animate({
            scrollTop: '+=500px'
        });
    }.bind(this));
}

Calendar.prototype.bindMonthChange = function () {
    document.getElementById("month-before").addEventListener("click", function () {
        var monthEarlier = new Date(this.year, this.month - 1, 1);
        this.setNewDates(monthEarlier);
    }.bind(this), false);
    document.getElementById("month-after").addEventListener("click", function () {
        var monthLater = new Date(this.year, this.month + 1, 1);
        this.setNewDates(monthLater);
    }.bind(this), false);
}

Calendar.prototype.setNewDates = function (newDates) {
    this.date = newDates;
    this.month = this.date.getMonth();
    this.day = this.date.getDate();
    this.year = this.date.getFullYear();
    this.initCalendar();
}

$(function () {
    var events = new Calendar();


    $("#event-apply").on('click', function (e) {
        console.log("SEND SHIZZLE");
    })
});
$(function () {
    skrollr.init({forceHeight: false});
    googleMap();
    setCustomers();
});
function googleMap() {
    var mapCanvas = document.getElementById('google-canvas');
    var mapOptions = {
        center: new google.maps.LatLng(52.019626, 5.150818),
        zoom: 18,
        mapTypeId: google.maps.MapTypeId.ROADMAP,
        panControl: false,
        zoomControl: false,
        mapTypeControl: false,
        scaleControl: false,
        streetViewControl: false,
        overviewMapControl: false
    }
    var map = new google.maps.Map(mapCanvas, mapOptions);

    var styles = [
        {
            "featureType": "poi",
            "stylers": [
                { "color": "#202020" }
            ]
        },
        {
            "featureType": "landscape",
            "stylers": [
                { "visibility": "on" },
                { "color": "#202020" }
            ]
        },
        {
            "featureType": "road",
            "elementType": "labels.text.fill",
            "stylers": [
                { "color": "#525455" },
                { "visibility": "on" }
            ]
        },
        {
            "featureType": "road",
            "elementType": "geometry",
            "stylers": [
                { "visibility": "on" },
                { "color": "#252626" }
            ]
        },
        {
            "featureType": "water",
            "stylers": [
                { "color": "#292929" }
            ]
        },
        {
            "featureType": "poi",
            "stylers": [
                { "visibility": "off" }
            ]
        },
        {
            "featureType": "road",
            "elementType": "labels.text.stroke",
            "stylers": [
                { "color": "#000" }
            ]
        },
        {
            "featureType": "transit",
            "stylers": [
                { "visibility": "off" }
            ]
        }
    ];

    map.setOptions({styles: styles});

    var marker = new google.maps.Marker({
        position: mapOptions.center,
        map: map,
        title: 'Frontmen',
        icon: '../img/marker.png'
    });


}

function setCustomers() {
    var lis = $('.portfolio_customers ul li');
    lis.each(function (i, el) {
        $(el).css('z-index', lis.length - i);
    });

    lis.on('click', function (e) {
        var titleElement = $('.page.portfolio__slide article' + '#' + e.currentTarget.id)
        var contentElement = $('.portfolio_customers--expand article' + '#' + e.currentTarget.id)

        lis.find('.selected').removeClass('selected');
        $(this).find('.small-circle').addClass('selected');

        _setShow(titleElement);
        _setShow(contentElement, true);

    });
}

function _setShow(el, animate) {
    el.parent().find('.show').removeClass('show');
    el.addClass('show');

    if (animate) {
        $('body').animate({ scrollTop: el.offset().top - 250 }, 'slow');
    }

}

