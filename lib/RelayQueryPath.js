/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule RelayQueryPath
 * 
 */

'use strict';

var RelayNodeInterface = require('./RelayNodeInterface');
var RelayQuery = require('./RelayQuery');
var RelayRecord = require('./RelayRecord');
var RelayRecordState = require('./RelayRecordState');

var forEachRootCallArg = require('./forEachRootCallArg');
var invariant = require('fbjs/lib/invariant');
var warning = require('fbjs/lib/warning');

var _require = require('./RelayConnectionInterface'),
    EDGES = _require.EDGES;

var ID = RelayNodeInterface.ID,
    ID_TYPE = RelayNodeInterface.ID_TYPE,
    NODE = RelayNodeInterface.NODE,
    NODE_TYPE = RelayNodeInterface.NODE_TYPE,
    TYPENAME = RelayNodeInterface.TYPENAME;


var idField = RelayQuery.Field.build({
  fieldName: ID,
  type: 'String'
});
var typeField = RelayQuery.Field.build({
  fieldName: TYPENAME,
  type: 'String'
});

/**
 * @internal
 *
 * Represents the path (root plus fields) within a query that fetched a
 * particular node. Each step of the path may represent a root query (for
 * refetchable nodes) or the field path from the nearest refetchable node.
 */
var RelayQueryPath = {
  createForID: function createForID(dataID, name, routeName) {
    !!RelayRecord.isClientID(dataID) ? process.env.NODE_ENV !== 'production' ? invariant(false, 'RelayQueryPath.createForID: Expected dataID to be a server id, got ' + '`%s`.', dataID) : invariant(false) : void 0;
    return {
      dataID: dataID,
      name: name,
      routeName: routeName || '$RelayQuery',
      type: 'node'
    };
  },
  create: function create(root) {
    if (root.getFieldName() === NODE) {
      var identifyingArg = root.getIdentifyingArg();
      if (identifyingArg && typeof identifyingArg.value === 'string') {
        return {
          dataID: identifyingArg.value,
          name: root.getName(),
          routeName: root.getRoute().name,
          type: 'node'
        };
      }
    }
    return {
      root: root,
      type: 'root'
    };
  },
  getPath: function getPath(parent, node, dataID) {
    if (dataID == null || RelayRecord.isClientID(dataID)) {
      return {
        node: node,
        parent: parent,
        type: 'client'
      };
    } else if (parent.type === 'node' && parent.dataID === dataID) {
      return parent;
    } else {
      return {
        dataID: dataID,
        name: RelayQueryPath.getName(parent),
        routeName: RelayQueryPath.getRouteName(parent),
        type: 'node'
      };
    }
  },
  isRootPath: function isRootPath(path) {
    return path.type === 'node' || path.type === 'root';
  },
  getParent: function getParent(path) {
    !(path.type === 'client') ? process.env.NODE_ENV !== 'production' ? invariant(false, 'RelayQueryPath: Cannot get the parent of a root path.') : invariant(false) : void 0;
    return path.parent;
  },
  getName: function getName(path) {
    while (path.type === 'client') {
      path = path.parent;
    }
    if (path.type === 'root') {
      return path.root.getName();
    } else if (path.type === 'node') {
      return path.name;
    } else {
      !false ? process.env.NODE_ENV !== 'production' ? invariant(false, 'RelayQueryPath.getName(): Invalid path `%s`.', path) : invariant(false) : void 0;
    }
  },
  getRouteName: function getRouteName(path) {
    while (path.type === 'client') {
      path = path.parent;
    }
    if (path.type === 'root') {
      return path.root.getRoute().name;
    } else if (path.type === 'node') {
      return path.routeName;
    } else {
      !false ? process.env.NODE_ENV !== 'production' ? invariant(false, 'RelayQueryPath.getRouteName(): Invalid path `%s`.', path) : invariant(false) : void 0;
    }
  },
  getQuery: function getQuery(store, path, appendNode) {
    var child = appendNode;
    var prevField = void 0;
    while (path.type === 'client') {
      var _node = path.node;
      if (_node instanceof RelayQuery.Field) {
        var schemaName = _node.getSchemaName();
        process.env.NODE_ENV !== 'production' ? warning(!prevField || prevField !== EDGES || !_node.isConnection(), 'RelayQueryPath.getQuery(): Cannot generate accurate query for ' + 'path with connection `%s`. Consider adding an `id` field to each ' + '`node` to make them refetchable.', schemaName) : void 0;
        prevField = schemaName;
      }
      var idFieldName = _node instanceof RelayQuery.Field ? _node.getInferredPrimaryKey() : ID;
      if (idFieldName) {
        child = _node.clone([child, _node.getFieldByStorageKey(idFieldName), _node.getFieldByStorageKey(TYPENAME)]);
      } else {
        child = _node.clone([child]);
      }
      path = path.parent;
    }
    var root = path.type === 'root' ? path.root : createRootQueryFromNodePath(path);
    var children = [child, root.getFieldByStorageKey(ID), root.getFieldByStorageKey(TYPENAME)];
    var rootChildren = getRootFragmentForQuery(store, root, children);
    var pathQuery = root.cloneWithRoute(rootChildren, appendNode.getRoute());
    // for flow
    !(pathQuery instanceof RelayQuery.Root) ? process.env.NODE_ENV !== 'production' ? invariant(false, 'RelayQueryPath: Expected the root of path `%s` to be a query.', RelayQueryPath.getName(path)) : invariant(false) : void 0;
    return pathQuery;
  }
};

function createRootQueryFromNodePath(nodePath) {
  return RelayQuery.Root.build(nodePath.name, NODE, nodePath.dataID, [idField, typeField], {
    identifyingArgName: ID,
    identifyingArgType: ID_TYPE,
    isAbstract: true,
    isDeferred: false,
    isPlural: false
  }, NODE_TYPE, nodePath.routeName);
}

function getRootFragmentForQuery(store, root, children) {
  var nextChildren = [];
  // $FlowIssue: Flow isn't recognizing that `filter(x => !!x)` returns a list
  // of non-null values.
  children.forEach(function (child) {
    if (child) {
      nextChildren.push(child);
    }
  });
  if (!root.isAbstract()) {
    // No need to wrap child nodes of a known concrete type.
    return nextChildren;
  }
  var identifyingArgKeys = [];
  forEachRootCallArg(root, function (_ref) {
    var identifyingArgKey = _ref.identifyingArgKey;

    identifyingArgKeys.push(identifyingArgKey);
  });
  var identifyingArgKey = identifyingArgKeys[0];
  var rootID = store.getDataID(root.getStorageKey(), identifyingArgKey);
  var rootType = rootID && store.getType(rootID);

  if (rootType != null) {
    return [RelayQuery.Fragment.build(root.getName(), rootType, nextChildren)];
  } else {
    var rootState = rootID != null ? store.getRecordState(rootID) : RelayRecordState.UNKNOWN;
    process.env.NODE_ENV !== 'production' ? warning(false, 'RelayQueryPath: No typename found for %s record `%s`. Generating a ' + 'possibly invalid query.', rootState.toLowerCase(), rootID) : void 0;
    return nextChildren;
  }
}

module.exports = RelayQueryPath;