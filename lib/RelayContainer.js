/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule RelayContainer
 * 
 */

'use strict';

var _extends2 = require('babel-runtime/helpers/extends');

var _extends3 = _interopRequireDefault(_extends2);

var _classCallCheck2 = require('babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _possibleConstructorReturn2 = require('babel-runtime/helpers/possibleConstructorReturn');

var _possibleConstructorReturn3 = _interopRequireDefault(_possibleConstructorReturn2);

var _inherits2 = require('babel-runtime/helpers/inherits');

var _inherits3 = _interopRequireDefault(_inherits2);

var _stringify = require('babel-runtime/core-js/json/stringify');

var _stringify2 = _interopRequireDefault(_stringify);

var _keys = require('babel-runtime/core-js/object/keys');

var _keys2 = _interopRequireDefault(_keys);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var ErrorUtils = require('fbjs/lib/ErrorUtils');
var React = require('react');
var RelayContainerComparators = require('./RelayContainerComparators');
var RelayContainerProxy = require('./RelayContainerProxy');
var RelayFragmentPointer = require('./RelayFragmentPointer');
var RelayFragmentReference = require('./RelayFragmentReference');
var RelayMetaRoute = require('./RelayMetaRoute');
var RelayMutationTransaction = require('./RelayMutationTransaction');
var RelayProfiler = require('./RelayProfiler');
var RelayPropTypes = require('./RelayPropTypes');
var RelayQuery = require('./RelayQuery');
var RelayRecord = require('./RelayRecord');
var RelayRecordStatusMap = require('./RelayRecordStatusMap');

var areEqual = require('fbjs/lib/areEqual');
var buildRQL = require('./buildRQL');
var filterObject = require('fbjs/lib/filterObject');
var forEachObject = require('fbjs/lib/forEachObject');
var invariant = require('fbjs/lib/invariant');
var isRelayEnvironment = require('./isRelayEnvironment');
var relayUnstableBatchedUpdates = require('./relayUnstableBatchedUpdates');
var shallowEqual = require('fbjs/lib/shallowEqual');
var warning = require('fbjs/lib/warning');

var _require = require('./RelayContainerUtils'),
    getComponentName = _require.getComponentName,
    getReactComponent = _require.getReactComponent;

var containerContextTypes = {
  relay: RelayPropTypes.Environment,
  route: RelayPropTypes.QueryConfig.isRequired,
  useFakeData: React.PropTypes.bool
};

/**
 * @public
 *
 * RelayContainer is a higher order component that provides the ability to:
 *
 *  - Encode data dependencies using query fragments that are parameterized by
 *    routes and variables.
 *  - Manipulate variables via methods on `this.props.relay`.
 *  - Automatically subscribe to data changes.
 *  - Avoid unnecessary updates if data is unchanged.
 *  - Propagate the `route` via context (available on `this.props.relay`).
 *
 */
function createContainerComponent(Component, spec) {
  var ComponentClass = getReactComponent(Component);
  var componentName = getComponentName(Component);
  var containerName = getContainerName(Component);
  var fragments = spec.fragments;
  var fragmentNames = (0, _keys2['default'])(fragments);
  var initialVariables = spec.initialVariables || {};
  var prepareVariables = spec.prepareVariables;
  var specShouldComponentUpdate = spec.shouldComponentUpdate;

  var RelayContainer = function (_React$Component) {
    (0, _inherits3['default'])(RelayContainer, _React$Component);

    function RelayContainer(props, context) {
      (0, _classCallCheck3['default'])(this, RelayContainer);

      var _this = (0, _possibleConstructorReturn3['default'])(this, _React$Component.call(this, props, context));

      var relay = context.relay,
          route = context.route;

      !isRelayEnvironment(relay) ? process.env.NODE_ENV !== 'production' ? invariant(false, 'RelayContainer: `%s` was rendered with invalid Relay context `%s`. ' + 'Make sure the `relay` property on the React context conforms to the ' + '`RelayEnvironment` interface.', containerName, relay) : invariant(false) : void 0;
      !(route && typeof route.name === 'string') ? process.env.NODE_ENV !== 'production' ? invariant(false, 'RelayContainer: `%s` was rendered without a valid route. Make sure ' + 'the route is valid, and make sure that it is correctly set on the ' + 'parent component\'s context (e.g. using <RelayRootContainer>).', containerName) : invariant(false) : void 0;

      _this._didShowFakeDataWarning = false;
      _this._fragmentPointers = {};
      _this._hasStaleQueryData = false;
      _this._fragmentResolvers = {};

      _this.mounted = true;
      _this.pending = null;
      _this.state = {
        queryData: {},
        rawVariables: {},
        relayProp: {
          applyUpdate: _this.context.relay.applyUpdate,
          commitUpdate: _this.context.relay.commitUpdate,
          forceFetch: _this.forceFetch.bind(_this),
          getPendingTransactions: _this.getPendingTransactions.bind(_this),
          hasFragmentData: _this.hasFragmentData.bind(_this),
          hasOptimisticUpdate: _this.hasOptimisticUpdate.bind(_this),
          hasPartialData: _this.hasPartialData.bind(_this),
          pendingVariables: null,
          route: route,
          setVariables: _this.setVariables.bind(_this),
          variables: {}
        }
      };
      return _this;
    }

    /**
     * Requests an update to variables. This primes the cache for the new
     * variables and notifies the caller of changes via the callback. As data
     * becomes ready, the component will be updated.
     */


    RelayContainer.prototype.setVariables = function setVariables(partialVariables, callback) {
      this._runVariables(partialVariables, callback, false);
    };

    /**
     * Requests an update to variables. Unlike `setVariables`, this forces data
     * to be fetched and written for the supplied variables. Any data that
     * previously satisfied the queries will be overwritten.
     */


    RelayContainer.prototype.forceFetch = function forceFetch(partialVariables, callback) {
      this._runVariables(partialVariables, callback, true);
    };

    /**
     * Creates a query for each of the component's fragments using the given
     * variables, and fragment pointers that can be used to resolve the results
     * of those queries. The fragment pointers are of the same shape as the
     * `_fragmentPointers` property.
     */


    RelayContainer.prototype._createQuerySetAndFragmentPointers = function _createQuerySetAndFragmentPointers(variables) {
      var _this2 = this;

      var fragmentPointers = {};
      var querySet = {};
      var storeData = this.context.relay.getStoreData();
      fragmentNames.forEach(function (fragmentName) {
        var fragment = getFragment(fragmentName, _this2.context.route, variables);
        var queryData = _this2.state.queryData[fragmentName];
        if (!fragment || queryData == null) {
          return;
        }

        var fragmentPointer = void 0;
        if (fragment.isPlural()) {
          !Array.isArray(queryData) ? process.env.NODE_ENV !== 'production' ? invariant(false, 'RelayContainer: Invalid queryData for `%s`, expected an array ' + 'of records because the corresponding fragment is plural.', fragmentName) : invariant(false) : void 0;
          var _dataIDs = [];
          queryData.forEach(function (data, ii) {
            /* $FlowFixMe(>=0.36.0) Flow error detected
             * during the deploy of Flow v0.36.0. To see the error, remove this
             * comment and run Flow */
            var dataID = RelayRecord.getDataIDForObject(data);
            if (dataID) {
              querySet[fragmentName + ii] = storeData.buildFragmentQueryForDataID(fragment, dataID);
              _dataIDs.push(dataID);
            }
          });
          if (_dataIDs.length) {
            fragmentPointer = { fragment: fragment, dataIDs: _dataIDs };
          }
        } else {
          /* $FlowFixMe(>=0.19.0) - queryData is mixed but getID expects Object
           */
          var dataID = RelayRecord.getDataIDForObject(queryData);
          if (dataID) {
            fragmentPointer = {
              fragment: fragment,
              dataIDs: dataID
            };
            querySet[fragmentName] = storeData.buildFragmentQueryForDataID(fragment, dataID);
          }
        }

        fragmentPointers[fragmentName] = fragmentPointer;
      });
      return { fragmentPointers: fragmentPointers, querySet: querySet };
    };

    RelayContainer.prototype._runVariables = function _runVariables(partialVariables, callback, forceFetch) {
      var _this3 = this;

      validateVariables(initialVariables, partialVariables);
      var lastVariables = this.state.rawVariables;
      var prevVariables = this.pending ? this.pending.rawVariables : lastVariables;
      var rawVariables = mergeVariables(prevVariables, partialVariables);
      var nextVariables = rawVariables;
      if (prepareVariables) {
        var metaRoute = RelayMetaRoute.get(this.context.route.name);
        nextVariables = prepareVariables(rawVariables, metaRoute);
        validateVariables(initialVariables, nextVariables);
      }

      this.pending && this.pending.request.abort();

      var completeProfiler = RelayProfiler.profile('RelayContainer.setVariables', {
        containerName: containerName,
        nextVariables: nextVariables
      });

      // Because the pending fetch is always canceled, we need to build a new
      // set of queries that includes the updated variables and initiate a new
      // fetch.

      var _createQuerySetAndFra = this._createQuerySetAndFragmentPointers(nextVariables),
          querySet = _createQuerySetAndFra.querySet,
          fragmentPointers = _createQuerySetAndFra.fragmentPointers;

      var onReadyStateChange = ErrorUtils.guard(function (readyState) {
        var aborted = readyState.aborted,
            done = readyState.done,
            error = readyState.error,
            ready = readyState.ready;

        var isComplete = aborted || done || error;
        if (isComplete && _this3.pending === current) {
          _this3.pending = null;
        }
        var partialState = void 0;
        if (ready) {
          // Only update query data if variables changed. Otherwise, `querySet`
          // and `fragmentPointers` will be empty, and `nextVariables` will be
          // equal to `lastVariables`.
          _this3._fragmentPointers = fragmentPointers;
          _this3._updateFragmentResolvers(_this3.context.relay);
          var _queryData = _this3._getQueryData(_this3.props);
          partialState = {
            queryData: _queryData,
            rawVariables: rawVariables,
            relayProp: (0, _extends3['default'])({}, _this3.state.relayProp, {
              pendingVariables: null,
              variables: nextVariables
            })
          };
        } else {
          partialState = {
            relayProp: (0, _extends3['default'])({}, _this3.state.relayProp, {
              pendingVariables: isComplete ? null : nextVariables
            })
          };
        }
        var mounted = _this3.mounted;
        if (mounted) {
          var updateProfiler = RelayProfiler.profile('RelayContainer.update');
          relayUnstableBatchedUpdates(function () {
            _this3.setState(partialState, function () {
              updateProfiler.stop();
              if (isComplete) {
                completeProfiler.stop();
              }
            });
            if (callback) {
              callback.call(
              // eslint-disable-next-line react/no-string-refs
              _this3.refs.component || null, (0, _extends3['default'])({}, readyState, { mounted: mounted }));
            }
          });
        } else {
          if (callback) {
            callback((0, _extends3['default'])({}, readyState, { mounted: mounted }));
          }
          if (isComplete) {
            completeProfiler.stop();
          }
        }
      }, 'RelayContainer.onReadyStateChange');

      var current = {
        rawVariables: rawVariables,
        request: forceFetch ? this.context.relay.forceFetch(querySet, onReadyStateChange) : this.context.relay.primeCache(querySet, onReadyStateChange)
      };
      this.pending = current;
    };

    /**
     * Determine if the supplied record reflects an optimistic update.
     */


    RelayContainer.prototype.hasOptimisticUpdate = function hasOptimisticUpdate(record) {
      var dataID = RelayRecord.getDataIDForObject(record);
      !(dataID != null) ? process.env.NODE_ENV !== 'production' ? invariant(false, 'RelayContainer.hasOptimisticUpdate(): Expected a record in `%s`.', componentName) : invariant(false) : void 0;
      return this.context.relay.getStoreData().hasOptimisticUpdate(dataID);
    };

    /**
     * Returns the pending mutation transactions affecting the given record.
     */


    RelayContainer.prototype.getPendingTransactions = function getPendingTransactions(record) {
      var dataID = RelayRecord.getDataIDForObject(record);
      !(dataID != null) ? process.env.NODE_ENV !== 'production' ? invariant(false, 'RelayContainer.getPendingTransactions(): Expected a record in `%s`.', componentName) : invariant(false) : void 0;
      var storeData = this.context.relay.getStoreData();
      var mutationIDs = storeData.getClientMutationIDs(dataID);
      if (!mutationIDs) {
        return null;
      }
      var mutationQueue = storeData.getMutationQueue();
      return mutationIDs.map(function (id) {
        return mutationQueue.getTransaction(id);
      });
    };

    /**
     * Checks if data for a deferred fragment is ready. This method should
     * *always* be called before rendering a child component whose fragment was
     * deferred (unless that child can handle null or missing data).
     */


    RelayContainer.prototype.hasFragmentData = function hasFragmentData(fragmentReference, record) {
      // convert builder -> fragment in order to get the fragment's name
      var dataID = RelayRecord.getDataIDForObject(record);
      !(dataID != null) ? process.env.NODE_ENV !== 'production' ? invariant(false, 'RelayContainer.hasFragmentData(): Second argument is not a valid ' + 'record. For `<%s X={this.props.X} />`, use ' + '`this.props.hasFragmentData(%s.getFragment(\'X\'), this.props.X)`.', componentName, componentName) : invariant(false) : void 0;
      var fragment = getDeferredFragment(fragmentReference, this.context, this.state.relayProp.variables);
      !(fragment instanceof RelayQuery.Fragment) ? process.env.NODE_ENV !== 'production' ? invariant(false, 'RelayContainer.hasFragmentData(): First argument is not a valid ' + 'fragment. Ensure that there are no failing `if` or `unless` ' + 'conditions.') : invariant(false) : void 0;
      var storeData = this.context.relay.getStoreData();
      return storeData.getCachedStore().hasFragmentData(dataID, fragment.getCompositeHash());
    };

    /**
     * Determine if the supplied record might be missing data.
     */


    RelayContainer.prototype.hasPartialData = function hasPartialData(record) {
      return RelayRecordStatusMap.isPartialStatus(record[RelayRecord.MetadataKey.STATUS]);
    };

    RelayContainer.prototype.componentWillMount = function componentWillMount() {
      if (this.context.route.useMockData) {
        return;
      }
      this.setState(this._initialize(this.props, this.context, initialVariables, null));
    };

    RelayContainer.prototype.componentWillReceiveProps = function componentWillReceiveProps(nextProps, maybeNextContext) {
      var _this4 = this;

      var nextContext = maybeNextContext;
      !nextContext ? process.env.NODE_ENV !== 'production' ? invariant(false, 'RelayContainer: Expected a context to be set.') : invariant(false) : void 0;
      if (nextContext.route.useMockData) {
        return;
      }
      this.setState(function (state) {
        if (_this4.context.relay !== nextContext.relay) {
          _this4._cleanup();
        }
        return _this4._initialize(nextProps, nextContext, resetPropOverridesForVariables(spec, nextProps, state.rawVariables), state.rawVariables);
      });
    };

    RelayContainer.prototype.componentWillUnmount = function componentWillUnmount() {
      this._cleanup();
      this.mounted = false;
    };

    RelayContainer.prototype._initialize = function _initialize(props, context, propVariables, prevVariables) {
      var rawVariables = getVariablesWithPropOverrides(spec, props, propVariables);
      var nextVariables = rawVariables;
      if (prepareVariables) {
        // TODO: Allow routes without names, #7856965.
        var metaRoute = RelayMetaRoute.get(context.route.name);
        nextVariables = prepareVariables(rawVariables, metaRoute);
        validateVariables(initialVariables, nextVariables);
      }
      this._updateFragmentPointers(props, context, nextVariables, prevVariables);
      this._updateFragmentResolvers(context.relay);
      return {
        queryData: this._getQueryData(props),
        rawVariables: rawVariables,
        relayProp: this.state.relayProp.route === context.route && shallowEqual(this.state.relayProp.variables, nextVariables) ? this.state.relayProp : (0, _extends3['default'])({}, this.state.relayProp, {
          route: context.route,
          variables: nextVariables
        })
      };
    };

    RelayContainer.prototype._cleanup = function _cleanup() {
      // A guarded error in mounting might prevent initialization of resolvers.
      if (this._fragmentResolvers) {
        forEachObject(this._fragmentResolvers, function (fragmentResolver) {
          return fragmentResolver && fragmentResolver.dispose();
        });
      }

      this._fragmentPointers = {};
      this._fragmentResolvers = {};

      var pending = this.pending;
      if (pending) {
        pending.request.abort();
        this.pending = null;
      }
    };

    RelayContainer.prototype._updateFragmentResolvers = function _updateFragmentResolvers(environment) {
      var _this5 = this;

      var fragmentPointers = this._fragmentPointers;
      var fragmentResolvers = this._fragmentResolvers;
      fragmentNames.forEach(function (fragmentName) {
        var fragmentPointer = fragmentPointers[fragmentName];
        var fragmentResolver = fragmentResolvers[fragmentName];
        if (!fragmentPointer) {
          if (fragmentResolver) {
            fragmentResolver.dispose();
            fragmentResolvers[fragmentName] = null;
          }
        } else if (!fragmentResolver) {
          fragmentResolver = environment.getFragmentResolver(fragmentPointer.fragment, _this5._handleFragmentDataUpdate.bind(_this5));
          fragmentResolvers[fragmentName] = fragmentResolver;
        }
      });
    };

    RelayContainer.prototype._handleFragmentDataUpdate = function _handleFragmentDataUpdate() {
      if (!this.mounted) {
        return;
      }
      var queryData = this._getQueryData(this.props);
      var updateProfiler = RelayProfiler.profile('RelayContainer.handleFragmentDataUpdate');
      this.setState({ queryData: queryData }, updateProfiler.stop);
    };

    RelayContainer.prototype._updateFragmentPointers = function _updateFragmentPointers(props, context, variables, prevVariables) {
      var _this6 = this;

      var fragmentPointers = this._fragmentPointers;
      fragmentNames.forEach(function (fragmentName) {
        var propValue = props[fragmentName];
        process.env.NODE_ENV !== 'production' ? warning(propValue !== undefined, 'RelayContainer: Expected prop `%s` to be supplied to `%s`, but ' + 'got `undefined`. Pass an explicit `null` if this is intentional.', fragmentName, componentName) : void 0;
        if (propValue == null) {
          fragmentPointers[fragmentName] = null;
          return;
        }
        // handle invalid prop values using a warning at first.
        if (typeof propValue !== 'object') {
          process.env.NODE_ENV !== 'production' ? warning(false, 'RelayContainer: Expected prop `%s` supplied to `%s` to be an ' + 'object, got `%s`.', fragmentName, componentName, propValue) : void 0;
          fragmentPointers[fragmentName] = null;
          return;
        }
        var fragment = getFragment(fragmentName, context.route, variables);
        var dataIDOrIDs = void 0;

        if (fragment.isPlural()) {
          // Plural fragments require the prop value to be an array of fragment
          // pointers, which are merged into a single fragment pointer to pass
          // to the query resolver `resolve`.
          !Array.isArray(propValue) ? process.env.NODE_ENV !== 'production' ? invariant(false, 'RelayContainer: Invalid prop `%s` supplied to `%s`, expected an ' + 'array of records because the corresponding fragment has ' + '`@relay(plural: true)`.', fragmentName, componentName) : invariant(false) : void 0;
          if (!propValue.length) {
            // Nothing to observe: pass the empty array through
            fragmentPointers[fragmentName] = null;
            return;
          }
          var _dataIDs2 = null;
          propValue.forEach(function (item, ii) {
            if (typeof item === 'object' && item != null) {
              if (RelayFragmentPointer.hasConcreteFragment(item, fragment)) {
                var dataID = RelayRecord.getDataIDForObject(item);
                if (dataID) {
                  _dataIDs2 = _dataIDs2 || [];
                  _dataIDs2.push(dataID);
                }
              }
              if (process.env.NODE_ENV !== 'production') {
                if (!context.route.useMockData && !context.useFakeData && !_this6._didShowFakeDataWarning) {
                  var isValid = validateFragmentProp(componentName, fragmentName, fragment, item, prevVariables);
                  _this6._didShowFakeDataWarning = !isValid;
                }
              }
            }
          });
          if (_dataIDs2) {
            !(_dataIDs2.length === propValue.length) ? process.env.NODE_ENV !== 'production' ? invariant(false, 'RelayContainer: Invalid prop `%s` supplied to `%s`. Some ' + 'array items contain data fetched by Relay and some items ' + 'contain null/mock data.', fragmentName, componentName) : invariant(false) : void 0;
          }
          dataIDOrIDs = _dataIDs2;
        } else {
          !!Array.isArray(propValue) ? process.env.NODE_ENV !== 'production' ? invariant(false, 'RelayContainer: Invalid prop `%s` supplied to `%s`, expected a ' + 'single record because the corresponding fragment is not plural ' + '(i.e. does not have `@relay(plural: true)`).', fragmentName, componentName) : invariant(false) : void 0;
          if (RelayFragmentPointer.hasConcreteFragment(propValue, fragment)) {
            dataIDOrIDs = RelayRecord.getDataIDForObject(propValue);
          }
          if (process.env.NODE_ENV !== 'production') {
            if (!context.route.useMockData && !context.useFakeData && !_this6._didShowFakeDataWarning) {
              var isValid = validateFragmentProp(componentName, fragmentName, fragment, propValue, prevVariables);
              _this6._didShowFakeDataWarning = !isValid;
            }
          }
        }
        fragmentPointers[fragmentName] = dataIDOrIDs ? { fragment: fragment, dataIDs: dataIDOrIDs } : null;
      });
      if (process.env.NODE_ENV !== 'production') {
        // If a fragment pointer is null, warn if it was found on another prop.
        fragmentNames.forEach(function (fragmentName) {
          if (fragmentPointers[fragmentName]) {
            return;
          }
          var fragment = getFragment(fragmentName, context.route, variables);
          (0, _keys2['default'])(props).forEach(function (propName) {
            process.env.NODE_ENV !== 'production' ? warning(fragmentPointers[propName] || !RelayRecord.isRecord(props[propName]) || typeof props[propName] !== 'object' || props[propName] == null || !RelayFragmentPointer.hasFragment(props[propName], fragment), 'RelayContainer: Expected record data for prop `%s` on `%s`, ' + 'but it was instead on prop `%s`. Did you misspell a prop or ' + 'pass record data into the wrong prop?', fragmentName, componentName, propName) : void 0;
          });
        });
      }
    };

    RelayContainer.prototype._getQueryData = function _getQueryData(props) {
      var _this7 = this;

      var queryData = {};
      var fragmentPointers = this._fragmentPointers;
      forEachObject(this._fragmentResolvers, function (fragmentResolver, propName) {
        var propValue = props[propName];
        var fragmentPointer = fragmentPointers[propName];

        if (!propValue || !fragmentPointer) {
          // Clear any subscriptions since there is no data.
          fragmentResolver && fragmentResolver.dispose();
          // Allow mock data to pass through without modification.
          queryData[propName] = propValue;
        } else {
          queryData[propName] = fragmentResolver.resolve(fragmentPointer.fragment, fragmentPointer.dataIDs);
        }
        if (_this7.state.queryData.hasOwnProperty(propName) && queryData[propName] !== _this7.state.queryData[propName]) {
          _this7._hasStaleQueryData = true;
        }
      });
      return queryData;
    };

    RelayContainer.prototype.shouldComponentUpdate = function shouldComponentUpdate(nextProps, nextState, nextContext) {
      if (specShouldComponentUpdate) {
        return specShouldComponentUpdate();
      }

      // Flag indicating that query data changed since previous render.
      if (this._hasStaleQueryData) {
        this._hasStaleQueryData = false;
        return true;
      }

      if (this.context.relay !== nextContext.relay || this.context.route !== nextContext.route) {
        return true;
      }

      var fragmentPointers = this._fragmentPointers;
      return !RelayContainerComparators.areNonQueryPropsEqual(fragments, this.props, nextProps) || fragmentPointers && !RelayContainerComparators.areQueryResultsEqual(fragmentPointers, this.state.queryData, nextState.queryData) || !RelayContainerComparators.areQueryVariablesEqual(this.state.relayProp.variables, nextState.relayProp.variables);
    };

    RelayContainer.prototype.render = function render() {
      if (ComponentClass) {
        return React.createElement(ComponentClass, (0, _extends3['default'])({}, this.props, this.state.queryData, {
          ref: 'component' // eslint-disable-line react/no-string-refs
          , relay: this.state.relayProp
        }));
      } else {
        // Stateless functional.
        var Fn = Component;
        return React.createElement(Fn, (0, _extends3['default'])({}, this.props, this.state.queryData, {
          relay: this.state.relayProp
        }));
      }
    };

    return RelayContainer;
  }(React.Component);

  function getFragment(fragmentName, route, variables) {
    var fragmentBuilder = fragments[fragmentName];
    !fragmentBuilder ? process.env.NODE_ENV !== 'production' ? invariant(false, 'RelayContainer: Expected `%s` to have a query fragment named `%s`.', containerName, fragmentName) : invariant(false) : void 0;
    var fragment = buildContainerFragment(containerName, fragmentName, fragmentBuilder, initialVariables);
    // TODO: Allow routes without names, #7856965.
    var metaRoute = RelayMetaRoute.get(route.name);
    return RelayQuery.Fragment.create(fragment, metaRoute, variables);
  }

  initializeProfiler(RelayContainer);
  RelayContainer.contextTypes = containerContextTypes;
  RelayContainer.displayName = containerName;
  RelayContainerProxy.proxyMethods(RelayContainer, Component);

  return RelayContainer;
}

/**
 * TODO: Stop allowing props to override variables, #7856288.
 */
function getVariablesWithPropOverrides(spec, props, variables) {
  var initialVariables = spec.initialVariables;
  if (initialVariables) {
    var mergedVariables = void 0;
    for (var _key in initialVariables) {
      if (_key in props) {
        mergedVariables = mergedVariables || (0, _extends3['default'])({}, variables);
        mergedVariables[_key] = props[_key];
      }
    }
    variables = mergedVariables || variables;
  }
  return variables;
}

/**
 * Compare props and variables and reset the internal query variables if outside
 * query variables change the component.
 *
 * TODO: Stop allowing props to override variables, #7856288.
 */
function resetPropOverridesForVariables(spec, props, variables) {
  var initialVariables = spec.initialVariables;
  for (var _key2 in initialVariables) {
    if (_key2 in props && !areEqual(props[_key2], variables[_key2])) {
      return initialVariables;
    }
  }
  return variables;
}

function initializeProfiler(RelayContainer) {
  RelayProfiler.instrumentMethods(RelayContainer.prototype, {
    componentWillMount: 'RelayContainer.prototype.componentWillMount',
    componentWillReceiveProps: 'RelayContainer.prototype.componentWillReceiveProps',
    shouldComponentUpdate: 'RelayContainer.prototype.shouldComponentUpdate'
  });
}

/**
 * Merges a partial update into a set of variables. If no variables changed, the
 * same object is returned. Otherwise, a new object is returned.
 */
function mergeVariables(currentVariables, partialVariables) {
  if (partialVariables) {
    for (var _key3 in partialVariables) {
      if (currentVariables[_key3] !== partialVariables[_key3]) {
        return (0, _extends3['default'])({}, currentVariables, partialVariables);
      }
    }
  }
  return currentVariables;
}

/**
 * Wrapper around `buildRQL.Fragment` with contextual error messages.
 */
function buildContainerFragment(containerName, fragmentName, fragmentBuilder, variables) {
  var fragment = buildRQL.Fragment(fragmentBuilder, variables);
  !fragment ? process.env.NODE_ENV !== 'production' ? invariant(false, 'Relay.QL defined on container `%s` named `%s` is not a valid fragment. ' + 'A typical fragment is defined using: Relay.QL`fragment on Type {...}`', containerName, fragmentName) : invariant(false) : void 0;
  return fragment;
}

function getDeferredFragment(fragmentReference, context, variables) {
  var route = RelayMetaRoute.get(context.route.name);
  var concreteFragment = fragmentReference.getFragment(variables);
  var concreteVariables = fragmentReference.getVariables(route, variables);
  return RelayQuery.Fragment.create(concreteFragment, route, concreteVariables, {
    isDeferred: true,
    isContainerFragment: fragmentReference.isContainerFragment(),
    isTypeConditional: false
  });
}

function validateVariables(initialVariables, partialVariables) {
  if (partialVariables) {
    for (var _key4 in partialVariables) {
      process.env.NODE_ENV !== 'production' ? warning(initialVariables.hasOwnProperty(_key4), 'RelayContainer: Expected query variable `%s` to be initialized in ' + '`initialVariables`.', _key4) : void 0;
    }
  }
}

function validateSpec(componentName, spec) {

  var fragments = spec.fragments;
  !(typeof fragments === 'object' && fragments) ? process.env.NODE_ENV !== 'production' ? invariant(false, 'Relay.createContainer(%s, ...): Missing `fragments`, which is expected ' + 'to be an object mapping from `propName` to: () => Relay.QL`...`', componentName) : invariant(false) : void 0;

  if (!spec.initialVariables) {
    return;
  }
  var initialVariables = spec.initialVariables || {};
  !(typeof initialVariables === 'object' && initialVariables) ? process.env.NODE_ENV !== 'production' ? invariant(false, 'Relay.createContainer(%s, ...): Expected `initialVariables` to be an ' + 'object.', componentName) : invariant(false) : void 0;

  forEachObject(fragments, function (_, name) {
    process.env.NODE_ENV !== 'production' ? warning(!initialVariables.hasOwnProperty(name), 'Relay.createContainer(%s, ...): `%s` is used both as a fragment name ' + 'and variable name. Please give them unique names.', componentName, name) : void 0;
  });
}

function getContainerName(Component) {
  return 'Relay(' + getComponentName(Component) + ')';
}

/**
 * Creates a lazy Relay container. The actual container is created the first
 * time a container is being constructed by React's rendering engine.
 */
function create(Component, spec) {
  var componentName = getComponentName(Component);
  var containerName = getContainerName(Component);

  validateSpec(componentName, spec);

  var fragments = spec.fragments;
  var fragmentNames = (0, _keys2['default'])(fragments);
  var initialVariables = spec.initialVariables || {};
  var prepareVariables = spec.prepareVariables;

  var Container = void 0;
  function ContainerConstructor(props, context) {
    if (!Container) {
      Container = createContainerComponent(Component, spec);
    }
    return new Container(props, context);
  }

  ContainerConstructor.getFragmentNames = function () {
    return fragmentNames;
  };
  ContainerConstructor.hasFragment = function (fragmentName) {
    return !!fragments[fragmentName];
  };
  ContainerConstructor.hasVariable = function (variableName) {
    return Object.prototype.hasOwnProperty.call(initialVariables, variableName);
  };

  /**
   * Retrieves a reference to the fragment by name. An optional second argument
   * can be supplied to override the component's default variables.
   */
  ContainerConstructor.getFragment = function (fragmentName, variableMapping) {
    var fragmentBuilder = fragments[fragmentName];
    if (!fragmentBuilder) {
      !false ? process.env.NODE_ENV !== 'production' ? invariant(false, '%s.getFragment(): `%s` is not a valid fragment name. Available ' + 'fragments names: %s', containerName, fragmentName, fragmentNames.map(function (name) {
        return '`' + name + '`';
      }).join(', ')) : invariant(false) : void 0;
    }
    !(typeof fragmentBuilder === 'function') ? process.env.NODE_ENV !== 'production' ? invariant(false, 'RelayContainer: Expected `%s.fragments.%s` to be a function returning ' + 'a fragment. Example: `%s: () => Relay.QL`fragment on ...`', containerName, fragmentName, fragmentName) : invariant(false) : void 0;
    if (variableMapping) {
      variableMapping = filterObject(variableMapping, function (_, name) {
        return Object.prototype.hasOwnProperty.call(initialVariables, name);
      });
    }
    return RelayFragmentReference.createForContainer(function () {
      return buildContainerFragment(containerName, fragmentName, fragmentBuilder, initialVariables);
    }, initialVariables, variableMapping, prepareVariables);
  };

  ContainerConstructor.contextTypes = containerContextTypes;
  ContainerConstructor.displayName = containerName;
  ContainerConstructor.moduleName = null;

  return ContainerConstructor;
}

/**
 * Returns whether the fragment `prop` contains a fragment pointer for the given
 * fragment's data, warning if it does not.
 */
function validateFragmentProp(componentName, fragmentName, fragment, prop, prevVariables) {
  var hasFragmentData = RelayFragmentPointer.hasFragment(prop, fragment) || !!prevVariables && areEqual(prevVariables, fragment.getVariables());
  if (!hasFragmentData) {
    var variables = fragment.getVariables();
    var fetchedVariables = RelayFragmentPointer.getFragmentVariables(prop, fragment);
    process.env.NODE_ENV !== 'production' ? warning(false, 'RelayContainer: component `%s` was rendered with variables ' + 'that differ from the variables used to fetch fragment ' + '`%s`. The fragment was fetched with variables `%s`, but rendered ' + 'with variables `%s`. This can indicate one of two possibilities: \n' + ' - The parent set the correct variables in the query - ' + '`%s.getFragment(\'%s\', {...})` - but did not pass the same ' + 'variables when rendering the component. Be sure to tell the ' + 'component what variables to use by passing them as props: ' + '`<%s ... %s />`.\n' + ' - You are intentionally passing fake data to this ' + 'component, in which case ignore this warning.', componentName, fragmentName, fetchedVariables ? fetchedVariables.map(function (vars) {
      return (0, _stringify2['default'])(vars);
    }).join(', ') : '(not fetched)', (0, _stringify2['default'])(variables), componentName, fragmentName, componentName, (0, _keys2['default'])(variables).map(function (key) {
      return key + '={...}';
    }).join(' ')) : void 0;
  }
  return hasFragmentData;
}

module.exports = { create: create };