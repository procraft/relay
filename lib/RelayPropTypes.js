/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule RelayPropTypes
 * 
 */

'use strict';

var isRelayContainer = require('./isRelayContainer');
var isRelayEnvironment = require('./isRelayEnvironment');
var sprintf = require('fbjs/lib/sprintf');

var _require = require('react'),
    PropTypes = _require.PropTypes;

var RelayPropTypes = {
  Container: function Container(props, propName, componentName) {
    var component = props[propName];
    if (component == null) {
      return new Error(sprintf('Required prop `%s` was not specified in `%s`.', propName, componentName));
    } else if (!isRelayContainer(component)) {
      return new Error(sprintf('Invalid prop `%s` supplied to `%s`, expected a RelayContainer.', propName, componentName));
    }
    return null;
  },
  Environment: function Environment(props, propName, componentName) {
    var context = props[propName];
    if (!isRelayEnvironment(context)) {
      return new Error(sprintf('Invalid prop/context `%s` supplied to `%s`, expected `%s` to be ' + 'an object conforming to the `RelayEnvironment` interface.', propName, componentName, context));
    }
    return null;
  },


  QueryConfig: PropTypes.shape({
    name: PropTypes.string.isRequired,
    params: PropTypes.object.isRequired,
    queries: PropTypes.object.isRequired
  })
};

module.exports = RelayPropTypes;