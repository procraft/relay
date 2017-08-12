/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule RelayOSSNodeInterface
 * 
 */

'use strict';

var forEachRootCallArg = require('./forEachRootCallArg');
var invariant = require('fbjs/lib/invariant');

/**
 * @internal
 *
 * Defines logic relevant to the informal "Node" GraphQL interface.
 */
var RelayOSSNodeInterface = {
  ANY_TYPE: '__any',
  ID: 'id',
  ID_TYPE: 'ID!',
  NODE: 'node',
  NODE_TYPE: 'Node',
  NODES: 'nodes',
  TYPENAME: '__typename',

  isNodeRootCall: function isNodeRootCall(fieldName) {
    return fieldName === RelayOSSNodeInterface.NODE || fieldName === RelayOSSNodeInterface.NODES;
  },
  getResultsFromPayload: function getResultsFromPayload(query, payload) {
    var results = [];

    var rootBatchCall = query.getBatchCall();
    if (rootBatchCall) {
      getPayloadRecords(query, payload).forEach(function (result) {
        if (typeof result !== 'object' || !result) {
          return;
        }
        var dataID = result[RelayOSSNodeInterface.ID];
        !(typeof dataID === 'string') ? process.env.NODE_ENV !== 'production' ? invariant(false, 'RelayOSSNodeInterface.getResultsFromPayload(): Unable to write ' + 'result with no `%s` field for query, `%s`.', RelayOSSNodeInterface.ID, query.getName()) : invariant(false) : void 0;
        results.push({
          result: result,
          rootCallInfo: {
            storageKey: RelayOSSNodeInterface.NODE,
            identifyingArgKey: dataID,
            identifyingArgValue: dataID
          }
        });
      });
    } else {
      var records = getPayloadRecords(query, payload);
      var ii = 0;
      var _storageKey = query.getStorageKey();
      forEachRootCallArg(query, function (_ref) {
        var identifyingArgKey = _ref.identifyingArgKey,
            identifyingArgValue = _ref.identifyingArgValue;

        var result = records[ii++];
        results.push({
          result: result,
          rootCallInfo: { storageKey: _storageKey, identifyingArgKey: identifyingArgKey, identifyingArgValue: identifyingArgValue }
        });
      });
    }

    return results;
  }
};

function getPayloadRecords(query, payload) {
  var fieldName = query.getFieldName();
  var identifyingArg = query.getIdentifyingArg();
  var identifyingArgValue = identifyingArg && identifyingArg.value || null;
  var records = payload[fieldName];
  if (!query.getBatchCall()) {
    if (Array.isArray(identifyingArgValue)) {
      !Array.isArray(records) ? process.env.NODE_ENV !== 'production' ? invariant(false, 'RelayOSSNodeInterface: Expected payload for root field `%s` to be ' + 'an array with %s results, instead received a single non-array result.', fieldName, identifyingArgValue.length) : invariant(false) : void 0;
      !(records.length === identifyingArgValue.length) ? process.env.NODE_ENV !== 'production' ? invariant(false, 'RelayOSSNodeInterface: Expected payload for root field `%s` to be ' + 'an array with %s results, instead received an array with %s results.', fieldName, identifyingArgValue.length, records.length) : invariant(false) : void 0;
    } else if (Array.isArray(records)) {
      !false ? process.env.NODE_ENV !== 'production' ? invariant(false, 'RelayOSSNodeInterface: Expected payload for root field `%s` to be ' + 'a single non-array result, instead received an array with %s results.', fieldName, records.length) : invariant(false) : void 0;
    }
  }
  return Array.isArray(records) ? records : [records || null];
}

module.exports = RelayOSSNodeInterface;