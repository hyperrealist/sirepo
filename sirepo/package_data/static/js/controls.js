'use strict';

var srlog = SIREPO.srlog;
var srdbg = SIREPO.srdbg;

SIREPO.app.config(() => {
    SIREPO.appFieldEditors += `
        <div data-ng-switch-when="MadxSimList" data-ng-class="fieldClass">
          <div data-sim-list="" data-model="model" data-field="field" data-code="madx" data-route="lattice"></div>
        </div>
        <div data-ng-switch-when="AmpTable">
          <div data-amp-table=""></div>
        </div>
        <div data-ng-switch-when="AmpField">
          <div data-amp-field=""></div>
        </div>
        <div data-ng-switch-when="ProcessVariables" class="col-sm-12">
          <div element-pv-fields=""></div>
        </div>
    `;
    // TODO(e-carlin): copied from madx
    SIREPO.lattice = {
        elementColor: {
            OCTUPOLE: 'yellow',
            QUADRUPOLE: 'red',
            SEXTUPOLE: 'lightgreen',
            KICKER: 'black',
            HKICKER: 'black',
            VKICKER: 'black',
        },
        elementPic: {
            aperture: ['COLLIMATOR', 'ECOLLIMATOR', 'RCOLLIMATOR'],
            bend: ['RBEND', 'SBEND'],
            drift: ['DRIFT'],
            lens: ['NLLENS'],
            magnet: ['HACDIPOLE', 'HKICKER', 'KICKER', 'MATRIX', 'MULTIPOLE', 'OCTUPOLE', 'QUADRUPOLE', 'RFMULTIPOLE', 'SEXTUPOLE', 'VACDIPOLE', 'VKICKER'],
            rf: ['CRABCAVITY', 'RFCAVITY', 'TWCAVITY'],
            solenoid: ['SOLENOID'],
            watch: ['INSTRUMENT', 'HMONITOR', 'MARKER', 'MONITOR', 'PLACEHOLDER', 'VMONITOR'],
            zeroLength: ['BEAMBEAM', 'CHANGEREF', 'DIPEDGE', 'SROTATION', 'TRANSLATION', 'XROTATION', 'YROTATION'],
        },
    };
    SIREPO.appReportTypes = `
        <div data-ng-switch-when="bpmMonitor" data-zoom="XY" data-bpm-monitor-plot="" class="sr-plot" data-model-name="{{ modelKey }}"></div>
        <div data-ng-switch-when="bpmHMonitor" data-zoom="X" data-bpm-monitor-plot="Horizontal" class="sr-plot" data-model-name="{{ modelKey }}"></div>
        <div data-ng-switch-when="bpmVMonitor" data-zoom="Y" data-bpm-monitor-plot="Vertical" class="sr-plot" data-model-name="{{ modelKey }}"></div>
    `;
});

SIREPO.app.factory('controlsService', function(appState, latticeService, requestSender) {
    const self = {};
    const mevToKg = 5.6096e26;
    const defaultFactor = 100;
    const elementaryCharge = 1.602e-19; // Coulomb
    const fieldMap = {
        QUADRUPOLE: 'K1',
        KICKER: 'KICK',
        HKICKER: 'KICK',
        VKICKER: 'KICK',
    };

    self.beamlineElements = () => {
        const models = self.latticeModels();
        return models.beamlines[0].items.map(elId => latticeService.elementForId(elId, models));
    };

    self.computeModel = () => 'animation';

    self.currentField = (kickField) => 'current_' + kickField;

    self.currentToKick = (model, kickField) => {
        requestSender.sendStatelessCompute(
            appState,
            data => {
                model[kickField] = data.kick;
            },
            {
                method: 'current_to_kick',
                command_beam: appState.models.command_beam,
                //TODO(pjm): not sure why null values get sent but undefined values do not
                amp_table: self.getAmpTables()[model.ampTable] || null,
                current: model[self.currentField(kickField)],
            });
    };

    self.fieldForCurrent = (modelName) => fieldMap[modelName];

    self.getAmpTables = () => appState.applicationState().ampTables || {};

    self.hasMadxLattice = () => appState.applicationState().externalLattice;

    self.isDeviceServer = () => appState.models.controlSettings.operationMode == 'DeviceServer';

    self.kickField = (currentField) => currentField.replace('current_', '');

    self.canChangeCurrents = () => {
        if (self.isDeviceServer() && appState.models.controlSettings.readOnly == '1') {
            return false;
        }
        return appState.models.simulationStatus
            && appState.models.simulationStatus.animation
            && ['pending', 'running'].indexOf(
                appState.models.simulationStatus.animation.state
            ) < 0;
    };

    self.latticeModels = () => appState.models.externalLattice.models;

    appState.setAppService(self);
    return self;
});

SIREPO.app.controller('ControlsController', function(appState, controlsService, errorService, frameCache, latticeService, panelState, persistentSimulation, requestSender, $scope, $window) {
    const self = this;
    self.appState = appState;
    self.controlsService = controlsService;
    self.simScope = $scope;

    function buildWatchColumns() {
        self.watches = [];
        for (let el of controlsService.beamlineElements()) {
            if (el.type.indexOf('MONITOR') >= 0) {
                const m = modelDataForElement(el);
                m.plotType = el.type == 'MONITOR'
                    ? 'bpmMonitor'
                    : (el.type == 'HMONITOR'
                       ? 'bpmHMonitor'
                       : 'bpmVMonitor');
                m.modelKey += 'Report';
                self.watches.push(m);
            }
        }
    }

    function dataFileChanged() {
        requestSender.sendStatefulCompute(
            appState,
            data => {
                if (data.error) {
                    errorService.alertText(data.error);
                    return;
                }
                const names = [
                    'externalLattice',
                    'optimizerSettings',
                    'controlSettings',
                    'command_twiss',
                    'command_beam',
                ];
                for (let f of names) {
                    appState.models[f] = data[f];
                }
                appState.saveChanges(names);
            },
            {
                method: 'get_external_lattice',
                simulationId: appState.models.dataFile.madxSirepo
            }
        );
    }

    function elementForId(id) {
        return findInContainer('elements', '_id', id);
    }

    function findExternalCommand(name) {
        return findInContainer('commands', '_type', name.replace('command_', ''));
    }

    function findInContainer(container, key, value) {
        let res;
        controlsService.latticeModels()[container].some(m => {
            if (m[key] == value) {
                res = m;
                return true;
            }
        });
        if (! res) {
            throw new Error(`model not found for ${key}: ${value}`);
        }
        return res;
    }

    function getInitialMonitorPositions() {
        if (self.simState && self.simState.isProcessing()) {
            // optimization is running
            return;
        }
        if (! appState.applicationState().externalLattice) {
            return;
        }
        controlsService.runningMessage = 'Reading currents and monitors...';
        panelState.clear('initialMonitorPositionsReport');
        panelState.requestData(
            'initialMonitorPositionsReport',
            (data) => {
                controlsService.runningMessage = '';
                handleElementValues(data);
            },
            false,
            (err) => {
                controlsService.runningMessage = '';
            });
    }

    function handleElementValues(data) {
        if (! data.elementValues) {
            return;
        }
        frameCache.setFrameCount(1);
        updateElements(data.elementValues);
        $scope.$broadcast('sr-elementValues', data.elementValues);
    }

    function modelDataForElement(element) {
        return {
            modelKey: 'el_' + element._id,
            title: element.name.replace(/\_/g, ' '),
            viewName: element.type,
            getData: () => element,
        };
    }

    function saveLattice(e, name) {
        if (name == name.toUpperCase()) {
            const m = appState.models[name];
            $.extend(elementForId(m._id), m);
            appState.removeModel(name);
            appState.saveQuietly('externalLattice');
        }
        if (['command_beam', 'command_twiss'].includes(name)) {
            $.extend(findExternalCommand(name), appState.models[name]);
            appState.saveQuietly('externalLattice');
        }
    }

    function updateElements(values) {
        if (! values.length) {
            return;
        }
        for (let k in values[values.length - 1]) {
            let mf = k.split('.');
            const el = latticeService.elementForId(
                mf[0].split('_')[1],
                controlsService.latticeModels());
            el[mf[1]] = parseFloat(values[values.length - 1][k]);
            // update the model if it is currently being viewed in a modal window
            if (appState.models[el._type] && appState.models[el._type]._id == el._id) {
                appState.models[el._type] = el;
            }
        }
        appState.saveQuietly('externalLattice');
    }

    function windowResize() {
        self.colClearFix = $window.matchMedia('(min-width: 1600px)').matches
            ? 6 : 4;
    }

    self.cancelCallback = () => controlsService.runningMessage = '';

    //TODO(pjm): init from template to allow listeners to register before data is received
    self.init = () => {
        if (! self.simState) {
            self.simState = persistentSimulation.initSimulationState(self);
            self.simState.runningMessage = () => controlsService.runningMessage;
            // wait for all directives to be initialized
            panelState.waitForUI(getInitialMonitorPositions);
        }
    };

    self.simHandleStatus = data => {
        if (self.simState.isProcessing()) {
            controlsService.runningMessage = 'Running Optimization';
            $scope.isRunningOptimizer = true;
        }
        if ($scope.isRunningOptimizer && data.elementValues) {
            handleElementValues(data);
        }
        if (! self.simState.isProcessing()) {
            if ($scope.isRunningOptimizer) {
                $scope.isRunningOptimizer = false;
                controlsService.runningMessage = '';
            }
        }
    };

    self.startSimulation = () => {
        controlsService.runningMessage = 'Starting Optimization';
        $scope.isRunningOptimizer = true;
        $scope.$broadcast('sr-clearElementValues');
        appState.saveChanges('optimizerSettings', self.simState.runSimulation);
    };

    if (controlsService.hasMadxLattice()) {
        buildWatchColumns();
    }
    else {
        $scope.$on('dataFile.changed', dataFileChanged);
        $scope.$on('externalLattice.changed', buildWatchColumns);
    }
    windowResize();
    $scope.$on('sr-window-resize', windowResize);
    $scope.$on('modelChanged', saveLattice);
    $scope.$on('cancelChanges', function(e, name) {
        if (name == name.toUpperCase()) {
            appState.removeModel(name);
            appState.cancelChanges('externalLattice');
        }
    });
    $scope.$on('initialMonitorPositionsReport.changed', getInitialMonitorPositions);

    return self;
});

SIREPO.app.directive('appFooter', function(controlsService) {
    return {
        restrict: 'A',
        scope: {
            nav: '=appFooter',
        },
        template: `
            <div data-common-footer="nav"></div>
            <div data-import-dialog=""></div>
        `,
    };
});

SIREPO.app.directive('appHeader', function(appState, panelState) {
    return {
	restrict: 'A',
	scope: {
            nav: '=appHeader',
	},
        template: `
            <div data-app-header-brand="nav"></div>
            <div data-app-header-left="nav"></div>
            <div data-app-header-right="nav">
              <app-header-right-sim-loaded>
		<div data-sim-sections="">
                  <li class="sim-section" data-ng-class="{active: nav.isActive('controls')}"><a href data-ng-click="nav.openSection('controls')"><span class="glyphicon glyphicon-dashboard"></span> Controls</a></li>
		</div>
              </app-header-right-sim-loaded>
              <app-settings>
                <div><a href data-ng-click="openSettings()"><span class="glyphicon glyphicon-th-list"></span> Control Settings</a></div>
              </app-settings>
              <app-header-right-sim-list>
                <ul class="nav navbar-nav sr-navbar-right">
                  <li><a href data-ng-click="nav.showImportModal()"><span class="glyphicon glyphicon-cloud-upload"></span> Import</a></li>
                </ul>
              </app-header-right-sim-list>
            </div>
        `,
        controller: function($scope) {
            $scope.openSettings = () => {
                panelState.showModalEditor('beamline');
            };
        },
    };
});

SIREPO.app.directive('bpmMonitorPlot', function(appState, panelState, plot2dService, plotting) {
    return {
        restrict: 'A',
        scope: {
            bpmMonitorPlot: '@',
            modelName: '@',
            zoom: '@'
        },
        templateUrl: '/static/html/plot2d.html' + SIREPO.SOURCE_CACHE_KEY,
        controller: function($scope) {
            const defaultDomain = [-0.0021, 0.0021];
            let points;
            let colName = $scope.modelName.substring(0, $scope.modelName.indexOf('Report'));
            $scope.isClientOnly = true;
            $scope[`isZoom${$scope.zoom}`] = true;

            function clearPoints() {
                points = [];
                plotting.addConvergencePoints($scope.select, '.plot-viewport', [], points);
                $scope.select('.plot-viewport').selectAll('.sr-scatter-point').remove();
                ['x', 'y'].forEach(dim => {
                    $scope.axes[dim].domain = [-1, 1];
                    $scope.axes[dim].scale.domain(appState.clone(defaultDomain));
                });
            }

            function domainWidth(domain) {
                return domain[1] - domain[0];
            }

            function fitPoints() {
                if (points.length <= 1) {
                    return;
                }
                let dim = appState.clone(defaultDomain);
                if (domainWidth($scope.axes.x.scale.domain()) < domainWidth(defaultDomain)) {
                    // keep current domain if domain width is smaller than default domain
                    // the user has zoomed in
                    return;
                }
                [0, 1].forEach(i => {
                    points.forEach(p => {
                        if (p[i] < dim[0]) {
                            dim[0] = p[i];
                        }
                        if (p[i] > dim[1]) {
                            dim[1] = p[i];
                        }
                    });
                    let pad = (dim[1] - dim[0]) / 20;
                    if (pad == 0) {
                        pad = 0.1;
                    }
                    dim[0] -= pad;
                    dim[1] += pad;
                });
                if ( -dim[0] > dim[1]) {
                    dim[1] = -dim[0];
                }
                else if (-dim[0] < dim[1]) {
                    dim[0] = -dim[1];
                }
                ['x', 'y'].forEach(axis => {
                    $scope.axes[axis].scale.domain(dim).nice();
                });
            }

            function pushAndTrim(p) {
                const MAX_BPM_POINTS = SIREPO.APP_SCHEMA.constants.maxBPMPoints;
                if (points.length && appState.deepEquals(p, points[points.length - 1])) {
                    return;
                }
                points.push(p);
                if (points.length > MAX_BPM_POINTS) {
                    points = points.slice(points.length - MAX_BPM_POINTS);
                }
            }

            $scope.init = () => {
                plot2dService.init2dPlot($scope, {
                    margin: {top: 50, right: 10, bottom: 50, left: 75},
                });
                $scope.load();
            };

            $scope.load = () => {
                clearPoints();
                $scope.aspectRatio = 1;
                $scope.updatePlot({
                    x_label: 'x [m]',
                    y_label: 'y [m]',
                    title: $scope.bpmMonitorPlot + ' Monitor',
                });
            };

            $scope.refresh = () => {
                plotting.refreshConvergencePoints($scope.select, '.plot-viewport', $scope.graphLine);
                $scope.select('.plot-viewport').selectAll('.sr-scatter-point')
                    .data(points)
                    .enter().append('circle')
                    .attr('class', 'sr-scatter-point')
                    .attr('r', 8);
                $scope.select('.plot-viewport').selectAll('.sr-scatter-point')
                    .attr('cx', $scope.graphLine.x())
                    .attr('cy', $scope.graphLine.y())
                    .attr('style', (d, i) => {
                        if (i == points.length - 1) {
                            return `fill: rgba(0, 0, 255, 0.7); stroke-width: 4; stroke: black`;
                        }
                        let opacity = (i + 1) / points.length * 0.5;
                        return `fill: rgba(0, 0, 255, ${opacity}); stroke-width: 1; stroke: black`;
                    });
            };

            $scope.$on('sr-elementValues', (event, rows) => {
                if (rows.length > 1) {
                    clearPoints();
                }
                rows.forEach(values => {
                    const point = [
                        parseFloat(values[colName + '.x'] || 0),
                        parseFloat(values[colName + '.y'] || 0),
                    ];
                    pushAndTrim(point);
                });
                fitPoints();
                plotting.addConvergencePoints($scope.select, '.plot-viewport', [], points);
                $scope.resize();
            });

            $scope.$on('sr-clearElementValues', () => {
                clearPoints();
                $scope.refresh();
            });
        },
        link: (scope, element) => plotting.linkPlot(scope, element),
    };
});

SIREPO.viewLogic('beamlineView', function(appState, controlsService, panelState, $scope) {

    function updateURLField() {
        panelState.showFields('controlSettings', [
            ['deviceServerURL', 'readOnly'], controlsService.isDeviceServer(),
        ]);
    }

    $scope.whenSelected = updateURLField;
    $scope.watchFields = [
        ['controlSettings.operationMode'], updateURLField,
    ];
});

SIREPO.viewLogic('commandBeamView', function(appState, panelState, $scope) {

    function updateParticleFields() {
        panelState.showFields('command_beam', [
            ['mass', 'charge'], appState.models.command_beam.particle == 'other',
        ]);
    }

    $scope.whenSelected = updateParticleFields;
    $scope.watchFields = [
        ['command_beam.particle'], updateParticleFields,
    ];
});

['kickerView', 'hkickerView', 'vkickerView'].forEach(view => {
    SIREPO.viewLogic(
        view,
        function(appState, controlsService, panelState, $scope) {
            $scope.whenSelected = () => {
                const r = controlsService.canChangeCurrents();
                panelState.enableFields('KICKER', [
                    ['current_hkick', 'current_vkick'], r,
                ]);
                ['HKICKER', 'VKICKER'].forEach((m) => {
                    panelState.enableField(m, 'current_kick', r);
                });
            };
        }
    );
});

['monitorView', 'hmonitorView', 'vmonitorView'].forEach(view => {
    SIREPO.viewLogic(
        view,
        function(panelState, $scope) {
            $scope.whenSelected = () => {
                panelState.enableFields('MONITOR', [
                    ['x', 'y'], false,
                ]);
                panelState.enableFields('HMONITOR', 'x', false);
                panelState.enableFields('VMONITOR', 'y', false);
            };
        }
    );
});

SIREPO.viewLogic('quadrupoleView', function(appState, controlsService, panelState, $scope) {
    $scope.whenSelected = () => {
        panelState.enableField(
            'QUADRUPOLE',
            'current_k1',
            controlsService.canChangeCurrents()
        );
    };
});

SIREPO.app.directive('optimizationPicker', function(latticeService) {
    return {
        restrict: 'A',
        scope: {
            controller: '='
        },
        template: `
            <div>
              <div class="container-fluid">
                <div class="row" data-ng-show="::showTabs">
                  <div class="col-sm-12">
                    <ul class="nav nav-tabs">
                      <li role="presentation" data-ng-class="{active: activeTab == 'targets'}"><a href data-ng-click="activeTab = 'targets'">Targets</a></li>
                      <li role="presentation" data-ng-class="{active: activeTab == 'inputs'}"><a href data-ng-click="activeTab = 'inputs'">Inputs</a></li>
                    </ul>
                  </div>
                </div>
                <br />
              <div data-ng-if="activeTab == 'targets'" class="row">
                <div class="clearfix" data-optimizer-table=""></div>
              </div>
                <div data-ng-if="activeTab == 'inputs'" class="row">
                  <div class="container-fluid">
                    <form name="form">
                      <table ng-repeat="(inputType, inputs) in appState.models.optimizerSettings.inputs" style="float: left; margin: 1em;">
                        <thead>
                          <th>{{stringsService.ucfirst(inputType)}}</th>
                        </thead>
                        <tbody>
                          <tr ng-repeat="(id, enabled) in inputs" >
                            <td class="form-group form-group-sm" >
                              <label class="form-check-label">
                                <input type="checkbox" ng-model="inputs[id]" />
                                  {{latticeService.elementForId(id, latticeModels).name}}
                              </label>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </form>
                  </div>
                </div>
              </div>
            </div>
        `,
        controller: function(appState, $scope, controlsService, stringsService) {
            $scope.appState = appState;
            $scope.latticeModels = controlsService.latticeModels();
            $scope.latticeService = latticeService;
            $scope.activeTab = 'targets';
            $scope.showTabs = true;
            $scope.stringsService = stringsService;
        },
    };
});

SIREPO.app.directive('optimizerTable', function(appState) {
    return {
        restrict: 'A',
        scope: {},
        template: `
            <form name="form" class="form-horizontal">
              <div class="form-group form-group-sm" data-model-field="'method'" data-form="form" data-model-name="'optimizerSettings'"></div>
              <table data-ng-show="appState.models.optimizerSettings.method == 'nmead'" style="width: 100%; table-layout: fixed; margin-bottom: 10px" class="table table-hover">
                <colgroup>
                  <col style="width: 10em">
                  <col style="width: 20%>
                  <col style="width: 20%">
                  <col style="width: 20%">
                </colgroup>
                <thead>
                  <tr>
                    <th>Monitor Name</th>
                    <th data-ng-repeat="label in labels track by $index" class="text-center">{{ label }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr data-ng-repeat="target in appState.models.optimizerSettings.targets track by $index">
                    <td class="form-group form-group-sm"><p class="form-control-static">{{ target.name }}</p></td>
                    <td class="form-group form-group-sm" data-ng-repeat="field in fields track by $index">
                      <div data-ng-show="target.hasOwnProperty(field)">
                        <div class="row" data-field-editor="fields[$index]" data-field-size="12" data-model-name="'optimizerTarget'" data-model="target"></div>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </form>
        `,
        controller: function($scope) {
            $scope.appState = appState;
            $scope.fields = ['x', 'y', 'weight'];
            $scope.labels = $scope.fields.map(f => SIREPO.APP_SCHEMA.model.optimizerTarget[f][0]);
        },
    };
});

SIREPO.app.directive('latticeFooter', function(appState, controlsService, latticeService, panelState, utilities, $timeout) {
    return {
        restrict: 'A',
        scope: {
            width: '@',
        },
        template: `
            <div class="text-center">
            <div data-ng-repeat="table in tables track by table.reading" style="display: inline-block; vertical-align: top; margin: 0 1.5em">
                <div data-ng-if="readings[table.reading].length">
                  <table class="table table-hover table-condensed" data-ng-attr-style="min-width: {{ table.columns.length * 10 }}em">
                    <tr><th colspan="3">{{ table.label }}</th></tr>
                    <tr data-ng-repeat="row in readings[table.reading] track by row.name" data-ng-class="{warning: row.id == selectedId}">
                      <td class="text-left" data-ng-click="elementClicked(row.name)" data-ng-dblclick="elementClicked(row.name, true)" style="padding: 0; user-select: none; cursor: pointer"><strong>{{row.name}}</strong></td>
                      <td style="padding: 0" data-ng-class="{'sr-updated-cell': row.changed[col]}" data-ng-repeat="col in table.columns track by $index" class="text-right">{{row[col]}}</td>
                    </tr>
                  </table>
                </div>
            </div>
            <div data-ng-if="controlsService.runningMessage" style="margin-left: 3em">
              <span class="glyphicon glyphicon-repeat sr-running-icon"></span> {{ controlsService.runningMessage }}
            </div>
            </div>
            `,
        controller: function($scope) {
            $scope.controlsService = controlsService;
            $scope.tables = [
                {
                    label: 'Kicker Current [A]',
                    reading: 'kicker',
                    columns: ['current_hkick', 'current_vkick'],
                    types: ['KICKER', 'HKICKER', 'VKICKER'],
                    colMapping: {
                        HKICKER: {
                            current_hkick: 'current_kick',
                        },
                        VKICKER: {
                            current_vkick: 'current_kick',
                        },
                    },
                },
                {
                    label: 'Quadrupole Current [A]',
                    reading: 'quadrupole',
                    columns: ['current_k1'],
                    types: ['QUADRUPOLE'],
                },
                {
                    label: 'Monitor [m]',
                    reading: 'monitor',
                    columns: ['x', 'y'],
                    types: ['MONITOR', 'HMONITOR', 'VMONITOR'],
                },
            ];
            $scope.selectedId = null;
            $scope.readings = {};

            function detectOverlap(positions, pos) {
                for (let p of positions) {
                    if (rectanglesOverlap(pos, p)) {
                        return p;
                    }
                }
            }

            function elementForName(name) {
                let res;
                controlsService.latticeModels().elements.some((el) => {
                    if (el.name == name) {
                        res = el;
                        return true;
                    }
                });
                return res;
            }

            $scope.elementClicked = (name, showEditor) => {
                const el = elementForName(name);
                if (el) {
                    setSelectedId(el._id);
                    if (showEditor) {
                        latticeService.editElement(el.type, el, controlsService.latticeModels());
                    }
                }
            };

            function setSelectedId(elId) {
                if ($scope.selectedId != elId) {
                    if ($scope.selectedId) {
                        const node = $('.sr-lattice-label-' + $scope.selectedId);
                        node.removeClass('sr-selected-badge');
                    }
                    $scope.selectedId = elId;
                    const node = $('.sr-lattice-label-' + $scope.selectedId);
                    node.addClass('sr-selected-badge');
                }
            }

            function formatReading(value) {
                return angular.isDefined(value) ? parseFloat(value).toFixed(6) : '';
            }

            function labelElements() {
                $('.sr-lattice-label').remove();
                const parentRect = $('#sr-lattice')[0].getBoundingClientRect();
                const positions = [];
                $("[class^='sr-beamline']").each( (_ , element) => {
                    positions.push(element.getBoundingClientRect());
                });
                $('#sr-lattice').find('title').each((v, node) => {
                    const values = $(node).text().split(': ');
                    if (! SIREPO.APP_SCHEMA.model[values[1]]) {
                        return;
                    }
                    const isMonitor = values[1].indexOf('MONITOR') >= 0;
                    const rect = node.parentElement.getBoundingClientRect();
                    let pos = [
                        rect.left - parentRect.left + (rect.right - rect.left) - 25,
                        isMonitor
                            ? rect.top - parentRect.top - 5
                            : rect.bottom - parentRect.top + 5,

                    ];
                    const el = elementForName(values[0]);
                    let div = $('<div/>', {
                        class: 'sr-lattice-label badge' + (el ? (' sr-lattice-label-' + el._id) : ''),
                    })
                        .html(values[0])
                        .css({
                            left: pos[0],
                            top: pos[1],
                            position: 'absolute',
                            cursor: 'pointer',
                            'user-select': 'none',
                        })
                        .on('click', () => {
                            $scope.elementClicked(values[0]);
                            $scope.$applyAsync();
                        })
                        .on('dblclick', () => {
                            $scope.elementClicked(values[0], true);
                            $scope.$applyAsync();
                        })
                        .appendTo($('.sr-lattice-holder'));
                    const maxChecks = 8;
                    let checkCount = 1;
                    let p = detectOverlap(positions, div[0].getBoundingClientRect());
                    let yOffset = 0;
                    const c = 3;
                    while (p) {
                        if (isMonitor) {
                            const d = div[0].getBoundingClientRect().bottom - p.top - 1;
                            if (d > c) {
                                yOffset -= d;
                            }
                            yOffset -= c;
                        }
                        else {
                            const d = p.bottom - div[0].getBoundingClientRect().top + 1;
                            if (d > c) {
                                yOffset += d;
                            }
                            yOffset += c;
                        }
                        div.css({
                            top: pos[1] + yOffset,
                        });
                        p = detectOverlap(positions, div[0].getBoundingClientRect());
                        if (checkCount++ > maxChecks) {
                            break;
                        }
                    }
                    positions.push(div[0].getBoundingClientRect());
                });
            }

            function rectanglesOverlap(pos1, pos2) {
                if (pos1.left > pos2.right || pos2.left > pos1.right) {
                    return false;
                }
                if (pos1.top > pos2.bottom || pos2.top > pos1.bottom) {
                    return false;
                }
                return true;
            }

            const prevValue = {};

            function updateReadings() {
                $scope.readings = {
                    monitor: [],
                    kicker: [],
                    quadrupole: [],
                };
                for (let el of controlsService.beamlineElements()) {
                    for (let table of $scope.tables) {
                        for (let type of table.types) {
                            if (el.type == type) {
                                const row = {
                                    id: el._id,
                                    name: el.name,
                                    changed: {},
                                };
                                for (let col of table.columns) {
                                    let v;
                                    if (table.colMapping && table.colMapping[type]) {
                                        if (table.colMapping[type][col]) {
                                            v = el[table.colMapping[type][col]];
                                        }
                                    }
                                    else if (col in el) {
                                        v = el[col];
                                    }
                                    row[col] = formatReading(v);
                                    const k = col + row.id;
                                    row.changed[col] = prevValue[k] != row[col];
                                    prevValue[k] = row[col];
                                }
                                $scope.readings[table.reading].push(row);
                            }
                        }
                    }
                }
                $timeout(() => {
                    for (let r in $scope.readings) {
                        for (let row of $scope.readings[r]) {
                            row.changed = {};
                        }
                    }
                }, 1500);
            }

            $scope.destroy = () => $('.sr-lattice-label').off();

            $scope.$on('sr-beamlineItemSelected', (e, idx) => {
                setSelectedId(controlsService.latticeModels().beamlines[0].items[idx]);
            });
            $scope.$on('sr-elementValues', updateReadings);
            $scope.$on('sr-renderBeamline', () => panelState.waitForUI(labelElements));
        },
    };
});

SIREPO.app.directive('ampTable', function(appState, controlsService) {
    return {
        restrict: 'A',
        template: `
            <div class="col-sm-6">
            <div class="lead">
              <span>{{ fieldName }}</span>
              = <span data-text-with-math="desc"></span></div>
            <div class="text-warning">{{ errorMessage }}</div>
            <div data-ng-show="showFileInput()">
              <input id="sr-amp-table-input" type="file" data-file-model="ampTableFile" accept=".csv"/>
            </div>
            <select data-ng-show="! showFileInput()" class="form-control" data-ng-model="model[field]" data-ng-options="item as item for item in fileNames"></select>
            <div style="margin-top: 1em; max-height: 30vh; overflow-y: auto;" data-ng-if="model[field]">
              <table class="table table-hover table-condensed">
                <tr>
                  <th class="text-center">Current</th>
                  <th class="text-center">Factor</th>
                </tr>
                <tr data-ng-repeat="row in getTable() track by $index">
                  <td class="text-right">{{ row[0] }}</td>
                  <td class="text-right">{{ row[1] }}</td>
                </tr>
              </table>
            </div>
            </div>
            `,
        controller: function($scope) {
            $scope.fieldName = controlsService.fieldForCurrent($scope.modelName);
            $scope.desc = '$\\frac {current [\\text A] \\cdot charge [\\text C]} {gamma \\cdot mass [\\text{kg}] \\cdot beta \\cdot c [\\text{m/s}]} \\cdot factor$';
            const addNewFile = '<Add New File>';
            buildFileNames();

            function buildFileNames() {
                let names = Object.keys(controlsService.getAmpTables()).sort((a, b) => a.localeCompare(b));
                names.unshift('');
                names.push(addNewFile);
                $scope.fileNames = names;
            }

            function parseText(text) {
                let rows = [];
                text.split(/\s*\n/).forEach(line => {
                    let row = line.split(/\s*,\s*/);
                    if (row.length >= 2) {
                        rows.push(row);
                    }
                });
                if (rows.length && rows[0][0].search(/\w/) >= 0) {
                    // ignore header
                    rows.shift();
                }
                if (! appState.models.ampTables) {
                    appState.models.ampTables = {};
                }
                const name = $scope.ampTableFile.name;
                const table = rows.map(
                    row => row.map(v => parseFloat(v))
                ).sort((a, b) => a[0] - b[0]);
                if (! validateTable(table)) {
                    $scope.$applyAsync();
                    return;
                }
                appState.models.ampTables[name] = table;
                appState.saveQuietly('ampTables');
                $scope.model[$scope.field] = name;
                buildFileNames();
                $scope.$applyAsync();
            }

            function validateTable(table) {
                $scope.errorMessage = '';
                if (! table.length) {
                    $scope.errorMessage = 'No rows found';
                    return false;
                }
                for (let i = 0; i < table.length; i++) {
                    const row = table[i];
                    if (row.length < 2) {
                        $scope.errorMessage = `Row #${i + 1}: Invalid row: ${row}`;
                        return false;
                    }
                    else if (isNaN(row[0]) || isNaN(row[1])) {
                        $scope.errorMessage = `Row #${i + 1}: Invalid number: ${row}`;
                        return false;
                    }
                }
                return true;
            }

            function selectFile() {
                const v = $scope.model[$scope.field];
                if (v == addNewFile) {
                    $scope.showFile = true;
                }
            }

            $scope.getTable = () => controlsService.getAmpTables()[$scope.model[$scope.field]];

            $scope.showFileInput = () => {
                if (! $scope.model) {
                    return false;
                }
                if (! $scope.model[$scope.field]) {
                    $scope.model[$scope.field] = '';
                }
                if ($scope.showFile) {
                    return true;
                }
                if ($scope.fileNames.length <= 2) {
                    return true;
                }
                return false;
            };

            $scope.$watch('ampTableFile', () => {
                if ($scope.ampTableFile) {
                    $scope.ampTableFile.text().then(parseText);
                }
            });
            $scope.$on('cancelChanges', () => {
                $scope.ampTableFile = null;
                $('#sr-amp-table-input').val(null);
                $scope.showFile = false;
                $scope.errorMessage = '';
            });
            appState.watchModelFields($scope, [$scope.modelName + '.' + $scope.field], selectFile);
        },
    };
});

SIREPO.app.directive('ampField', function(appState, controlsService) {
    return {
        restrict: 'A',
        template: `
            <div class="col-sm-3">
              <input data-ng-model="model[field]" data-string-to-number="" class="form-control" style="text-align: right" data-lpignore="true" required />
            </div>
            <div class="col-sm-4"><div class="form-control-static" style="text-overflow: ellipsis; overflow: hidden; margin-left: -15px; padding-left: 0; white-space: nowrap"><strong>{{ currentField }}</strong> {{ model[kickField] | number:6 }}</div></div>`,
        controller: function($scope) {
            $scope.currentField = controlsService.fieldForCurrent($scope.modelName);
            $scope.kickField = controlsService.kickField($scope.field);
            $scope.$watch('model.' + $scope.field, () => {
                if ($scope.model && angular.isDefined($scope.model[$scope.field])) {
                    controlsService.currentToKick(
                        $scope.model,
                        controlsService.kickField($scope.field));
                }
            });
        },
    };
});

SIREPO.app.directive('elementPvFields', function(appState, controlsService, latticeService) {
    return {
        restrict: 'A',
        scope: {},
        template: `
            <form name="form" style="margin-top:-2em"><div class="col-sm-12">
              <div class="form-group form-group-sm" data-ng-if="controlsService.hasMadxLattice()" style="max-height: 75vh; overflow-y: auto;">
                <table class="table table-condensed">
                  <tr>
                    <th class="text-center" data-ng-repeat="h in headers track by $index">{{ h }}</th>
                    <th></th>
                  </tr>
                  <tr data-ng-class="{warning: pv.isWritable == '1'}" data-ng-repeat="pv in appState.models.controlSettings.processVariables track by $index">
                    <td data-ng-repeat="f in fields track by $index">
                      <div class="form-control-static">{{ ::getValue(pv, f) }}</div>
                    </td>
                    <td>
                      <div>
                        <input data-ng-model="pv.pvName" class="form-control" data-lpignore="true" />
                      </div>
                    </td>
                  </tr>
                </table>
              </div>
            </div></form>
        `,
        controller: function($scope) {
            $scope.modelName = 'beamline';
            $scope.appState = appState;
            $scope.controlsService = controlsService;
            $scope.pvFields = ['controlsService.processVariables'];
            $scope.headers = ['Type', 'Element Name', 'Description', 'Process Variable Name'];
            $scope.fields = ['type', 'name', 'description'];

            $scope.getValue = (pv, field) => {
                const el = latticeService.elementForId(pv.elId, controlsService.latticeModels());
                if (field == 'description') {
                    let res = '';
                    if (pv.pvDimension != 'none') {
                        res += pv.pvDimension + ' ';
                    }
                    if (el.type.indexOf('MONITOR') >= 0) {
                        res += 'position ';
                    }
                    else if (el.type == 'QUADRUPOLE' || el.type.indexOf('KICKER') >= 0) {
                        res += 'current ';
                    }
                    res += pv.isWritable == '1' ? 'setting' : 'reading';
                    return res;
                }
                return el[field];
            };
        },
    };
});
