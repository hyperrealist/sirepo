'use strict';

var srlog = SIREPO.srlog;
var srdbg = SIREPO.srdbg;

SIREPO.app.config(() => {
    SIREPO.PLOTTING_HEATPLOT_FULL_PIXEL = true;
    SIREPO.appReportTypes = `
        <div data-ng-switch-when="geometry3d" data-geometry-3d="" class="sr-plot" data-model-name="{{ modelKey }}" data-report-id="reportId"></div>
        <div data-ng-switch-when="tallyViewer" data-tally-viewer="" class="sr-plot" data-model-name="{{ modelKey }}" data-report-id="reportId"></div>
    `;
    //TODO(pjm): OptionalFloat should be standard
    SIREPO.appFieldEditors = `
        <div data-ng-switch-when="Color" data-ng-class="fieldClass">
          <input type="color" data-ng-model="model[field]" class="sr-color-button">
        </div>
        <div data-ng-switch-when="Point3D" class="col-sm-7">
          <div data-point3d="" data-model="model" data-field="field"></div>
        </div>
        <div data-ng-switch-when="OptionalFloat" data-ng-class="fieldClass">
          <input data-string-to-number="" data-ng-model="model[field]"
            data-min="info[4]" data-max="info[5]" class="form-control"
            style="text-align: right" data-lpignore="true" />
        </div>
        <div data-ng-switch-when="MaterialComponents" class="col-sm-12">
          <div data-material-components=""></div>
        </div>
        <div data-ng-switch-when="ComponentName" data-ng-class="fieldClass">
          <input data-component-name="" data-ng-model="model[field]"
            class="form-control" data-lpignore="true" data-ng-required="isRequired()"
            autocomplete="chrome-off" />
        </div>
        <div data-ng-switch-when="PercentWithType" data-ng-class="fieldClass">
          <div data-compound-field="" data-field1="percent"
            data-field2="percent_type" data-field2-size="8em"
            data-model-name="modelName" data-model="model"></div>
        </div>
        <div data-ng-switch-when="EnrichmentWithType" data-ng-class="fieldClass">
          <div data-compound-field="" data-field1="enrichment"
            data-field2="enrichment_type" data-field2-size="8em"
            data-model-name="modelName" data-model="model"></div>
        </div>
        <div data-ng-switch-when="DensityWithUnits" data-ng-class="fieldClass">
          <div data-compound-field="" data-field1="density"
            data-field2="density_units" data-field2-size="10em"
            data-model-name="modelName" data-model="model"></div>
        </div>
        <div data-ng-switch-when="Spatial">
          <div data-multi-level-editor="spatial" data-model="model" data-field="field"></div>
        </div>
        <div data-ng-switch-when="Univariate">
          <div data-multi-level-editor="univariate" data-model="model" data-field="field"></div>
        </div>
        <div data-ng-switch-when="UnitSphere">
          <div data-multi-level-editor="unitSphere" data-model="model" data-field="field"></div>
        </div>
        <div data-ng-switch-when="SourcesOrTallies">
          <div data-sources-or-tallies-editor="" data-model-name="modelName"
            data-model="model" data-field="field"></div>
        </div>
        <div data-ng-switch-when="TallyAspects" class="col-sm-12">
          <div data-tally-aspects="" data-model="model" data-field="model[field]"></div>
           <div class="sr-input-warning"></div>
        </div>
        <div data-ng-switch-when="TallyScoreWithGrouping" class="col-sm-10">
          <div data-tally-score-group="" data-model="model" data-field="field" data-enum="enum"></div>
        </div>
        <div data-ng-switch-when="SimpleListEditor" class="col-sm-7">
          <div data-simple-list-editor="" data-model="model" data-field="field" data-sub-model="info[4]"></div>
        </div>
        <div data-ng-switch-when="Filter">
          <div data-multi-level-editor="filter" data-model="model" data-field="field"></div>
        </div>
        <div data-ng-switch-when="MaterialValue" data-ng-class="fieldClass">
          <div data-material-list="" data-model="model" data-field="field"></div>
        </div>
        <div data-ng-switch-when="TallyList" data-ng-class="fieldClass">
          <div class="input-group">
            <select class="form-control" data-ng-model="model[field]" data-ng-options="t.name as t.name for t in model.tallies"></select>
          </div>
        </div>
        <div data-ng-switch-when="ScoreList" data-ng-class="fieldClass">
          <div class="input-group">
            <select class="form-control" data-ng-model="model[field]" data-ng-options="s.score as s.score for s in (model.tallies | filter:{name:model.tally})[0].scores"></select>
          </div>
        </div>
    `;
    SIREPO.FILE_UPLOAD_TYPE = {
        'geometryInput-dagmcFile': '.h5m',
    };
});

SIREPO.app.factory('cloudmcService', function(appState, panelState) {
    const self = {};
    appState.setAppService(self);

    function findScore(score) {
        return findTally().scores.filter(v => v.score === score).length
            ? score
            : null;
    }

    function findTally() {
        const a = appState.models.openmcAnimation;
        return a.tallies.filter(v => v.name === a.tally)[0];
    }

    // volumes are measured in centimeters
    self.GEOMETRY_SCALE = SIREPO.APP_SCHEMA.constants.geometryScale;

    self.buildRangeDelegate = (modelName, field) => {
        const d = panelState.getFieldDelegate(modelName, field);
        d.range = () => {
            return {
                min: appState.fieldProperties(modelName, field).min,
                max: appState.fieldProperties(modelName, field).max,
                step: 0.01
            };
        };
        d.readout = () => {
            return appState.modelInfo(modelName)[field][SIREPO.INFO_INDEX_LABEL];
        };
        d.update = () => {};
        d.watchFields = [];
        return d;
    };

    self.computeModel = modelKey => modelKey;

    self.getNonGraveyardVolumes = () => {
        const vols = [];
        for (const n in appState.models.volumes) {
            if (! self.isGraveyard(appState.models.volumes[n])) {
                vols.push(appState.models.volumes[n].volId);
            }
        }
        return vols;
    };

    self.getVolumeById = volId => {
        for (const n in appState.models.volumes) {
            const v = appState.models.volumes[n];
            if (v.volId === volId) {
                return v;
            }
        }
        return null;
    };

    self.findTally = findTally;

    self.isGraveyard = volume => {
        return volume.name && volume.name.toLowerCase() === 'graveyard';
    };

    self.validateSelectedTally = () => {
        const a = appState.models.openmcAnimation;
        if (! a.tally || ! findTally()) {
            a.tally = a.tallies[0].name;
        }
        if (! a.score || ! findScore(a.score)) {
            a.score = findTally().scores[0].score;
        }
        appState.saveQuietly('openmcAnimation');
    };
    return self;
});

SIREPO.app.controller('GeometryController', function (appState, cloudmcService, panelState, persistentSimulation, requestSender, $scope) {
    const self = this;
    let hasVolumes = false;

    function downloadRemoteGeometryFile() {
        requestSender.sendStatefulCompute(
            appState,
            data => {
                if (data.error) {
                    throw new Error(data.error);
                }
                appState.models.geometryInput.exampleURL = "";
                appState.saveQuietly('geometryInput');
                processGeometry();
            },
            {
                method: 'download_remote_lib_file',
                args: {
                    exampleURL: appState.models.geometryInput.exampleURL,
                },
            }
        );
    }

    function processGeometry() {
        panelState.showField('geometryInput', 'dagmcFile', false);
        if (appState.models.geometryInput.exampleURL) {
            downloadRemoteGeometryFile();
            return;
        }
        self.simState.runSimulation();
    }

    self.isGeometrySelected = () => {
        return appState.applicationState().geometryInput.dagmcFile;
    };
    self.isGeometryProcessed = () => hasVolumes;
    self.simHandleStatus = data => {
        self.hasServerStatus = true;
        if (data.volumes) {
            hasVolumes = true;
            if (! Object.keys(appState.applicationState().volumes).length) {
                appState.models.volumes = data.volumes;
                appState.saveChanges('volumes');
            }
        }
        else if (data.state === 'missing' || data.state === 'canceled') {
            if (self.isGeometrySelected()) {
                processGeometry();
            }
        }
    };

    $scope.$on('geometryInput.changed', () => {
        if (! hasVolumes) {
            processGeometry();
        }
    });

    self.simScope = $scope;
    self.simComputeModel = 'dagmcAnimation';
    self.simState = persistentSimulation.initSimulationState(self);
});

SIREPO.app.controller('VisualizationController', function(appState, cloudmcService, frameCache, persistentSimulation, requestSender, tallyService, $scope) {
    const self = this;
    self.eigenvalue = null;
    self.results = null;
    self.simScope = $scope;
    self.simComputeModel = 'openmcAnimation';
    let errorMessage;

    function validateSelectedTally(tallies) {
        appState.models.openmcAnimation.tallies = tallies;
        appState.saveQuietly('openmcAnimation');
        cloudmcService.validateSelectedTally();
    }

    self.eigenvalueHistory = () => appState.models.settings.eigenvalueHistory;

    self.simHandleStatus = function (data) {
        errorMessage = data.error;
        self.eigenvalue = data.eigenvalue;
        self.results = data.results;
        if (data.frameCount) {
            frameCache.setFrameCount(data.frameCount);
        }
        if (data.tallies) {
            validateSelectedTally(data.tallies);
        }
    };
    self.simState = persistentSimulation.initSimulationState(self);
    self.simState.errorMessage = () => errorMessage;
    self.simState.runningMessage = () => {
        return `Completed batch: ${self.simState.getFrameCount()}`;
    };
    self.startSimulation = function() {
        tallyService.clearMesh();
        delete appState.models.openmcAnimation.tallies;
        self.simState.saveAndRunSimulation('openmcAnimation');
    };
    self.simState.logFileURL = function() {
        return requestSender.downloadDataFileUrl(
            appState,
            {
                model: self.simState.model,
                suffix: 'log',
            },
        );
    };
    self.tallyTitle = () => {
        const a = appState.models.openmcAnimation;
        return `Tally Results - ${a.tally} - ${a.score} - ${a.aspect}`;
    };
    return self;
});

SIREPO.app.directive('appFooter', function() {
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

SIREPO.app.directive('appHeader', function(appState, cloudmcService, panelState) {
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
                  <li class="sim-section" data-ng-class="{active: nav.isActive('geometry')}"><a href data-ng-click="nav.openSection('geometry')"><span class="glyphicon glyphicon-globe"></span> Geometry</a></li>
                  <li class="sim-section" data-ng-class="{active: nav.isActive('visualization')}"><a href data-ng-click="nav.openSection('visualization')"><span class="glyphicon glyphicon-picture"></span> Visualization</a></li>
                </div>
              </app-header-right-sim-loaded>
              <app-settings>
              </app-settings>
              <app-header-right-sim-list>
                <ul class="nav navbar-nav sr-navbar-right">
                  <li><a href data-ng-click="nav.showImportModal()"><span class="glyphicon glyphicon-cloud-upload"></span> Import</a></li>
                </ul>
              </app-header-right-sim-list>
            </div>
        `,
    };
});

SIREPO.app.factory('tallyService', function(appState, cloudmcService, $rootScope) {
    const self = {
        mesh: null,
        fieldData: null,
        minField: 0,
        maxField: 0,
        outlines: null,
    };

    self.clearMesh = () => {
        self.mesh = null;
        self.fieldData = null;
        self.outlines = null;
    };

    self.colorScale = modelName => {
        return SIREPO.PLOTTING.Utils.colorScale(
            self.minField,
            self.maxField,
            SIREPO.PLOTTING.Utils.COLOR_MAP()[appState.applicationState()[modelName].colorMap],
        );
    };

    self.getMeshRanges = () => {
        return SIREPO.GEOMETRY.GeometryUtils.BASIS().map(
            dim => SIREPO.GEOMETRY.GeometryUtils.axisIndex(dim),
        ).map(i => [
            cloudmcService.GEOMETRY_SCALE * self.mesh.lower_left[i],
            cloudmcService.GEOMETRY_SCALE * self.mesh.upper_right[i],
            self.mesh.dimension[i],
        ]);
    };

    self.getOutlines = (volId, dim, index) => {
        if (! self.outlines) {
            return [];
        }
        const t = self.outlines[appState.applicationState().openmcAnimation.tally];
        if (t && t[`${volId}`]) {
            const o = t[`${volId}`][dim];
            if (o.length) {
                return o[index];
            }
        }
        return [];
    };

    self.initMesh = () => {
        const t = cloudmcService.findTally();
        for (let k = 1; k <= SIREPO.APP_SCHEMA.constants.maxFilters; k++) {
            const f = t[`filter${k}`];
            if (f && f._type === 'meshFilter') {
                self.mesh = f;
                return true;
            }
        }
        self.mesh = null;
        return false;
    };

    self.setFieldData = (fieldData, min, max) => {
        self.fieldData = fieldData;
        self.minField = min;
        self.maxField = max;
    };

    self.setOutlines = (tally, outlines) => {
        if (appState.applicationState().openmcAnimation.tally === tally) {
            self.outlines = {
                [tally]: outlines,
            };
        }
    };

    self.tallyRange = (dim, useBinCenter=false) => {
        if (! self.mesh) {
            return {};
        }
        const r = self.getMeshRanges()[SIREPO.GEOMETRY.GeometryUtils.BASIS().indexOf(dim)];
        const s = Math.abs((r[1] - r[0])) / r[2];
        const f = useBinCenter ? 0.5 : 0;
        return {
            min: r[0] + f * s,
            max: r[1] - f * s,
            step: s,
        };
    };

    $rootScope.$on('modelsUnloaded', self.clearMesh);

    return self;
});

SIREPO.app.factory('volumeLoadingService', function(appState, requestSender, $rootScope) {
    const self = {};
    let cacheReadersByVol = {};

    function addVolume(volId, initCallback) {
        let reader = cacheReadersByVol[volId];
        let res;
        if (reader) {
            res = Promise.resolve();
        }
        else {
            reader = vtk.IO.Core.vtkHttpDataSetReader.newInstance();
            cacheReadersByVol[volId] = reader;
            res = reader.setUrl(volumeURL(volId), {
                compression: 'zip',
                fullpath: true,
                loadData: true,
            });
        }
        initCallback(volId, reader);
        return res;
    }

    function volumesError(reason) {
        srlog(new Error(`Volume load failed: ${reason}`));
        $rootScope.$broadcast('vtk.hideLoader');
    }

    function volumeURL(volId) {
        return requestSender.downloadDataFileUrl(
            appState,
            {
                model: 'dagmcAnimation',
                frame: volId,
            }
        );
    }

    self.loadVolumes = (volIds, initCallback, loadedCallback) => {
        //TODO(pjm): update progress bar with each promise resolve?
        Promise.all(
            volIds.map(i => addVolume(i, initCallback))
        ).then(loadedCallback, volumesError);
    };

    $rootScope.$on('modelsUnloaded', () => {
        cacheReadersByVol = {};
    });

    return self;
});

SIREPO.app.directive('tallyVolumePicker', function(cloudmcService, volumeLoadingService) {
    return {
        restrict: 'A',
        scope: {
            renderVolumes: '&',
            setVolumeVisible: '&',
        },
        template: `
            <div data-ng-if="volumeList" style="padding-top: 8px; padding-bottom: 8px;"><div data-ng-click="toggleVolumeList()" title="{{ isVolumeListExpanded ? 'hide' : 'show' }}" style="cursor: pointer; display: inline-block">Select Volumes <span class="glyphicon" data-ng-class="isVolumeListExpanded ? 'glyphicon-chevron-up' : 'glyphicon-chevron-down'"></span></div></div>
            <div data-ng-if="! buildVolumeList()" style="padding-top: 8px; padding-bottom: 8px;">Loading Volumes<span data-header-tooltip="'loading'"></span></div>
            <table data-ng-show="isVolumeListExpanded" class="table-condensed">
                <thead>
                <th style="border-bottom: solid lightgray;" colspan="{{ numVolumeCols }}">
                    <div
                        title="{{ allVolumesVisible ? 'Deselect' : 'Select' }} all volumes"
                        style="display: inline-block; cursor: pointer; white-space: nowrap; min-height: 25px;"
                        data-ng-click="toggleAllVolumes(v)">
                            <span class="glyphicon"
                                data-ng-class="allVolumesVisible ? 'glyphicon-check' : 'glyphicon-unchecked'">
                            </span>
                    </div>
                </th>
                </thead>
                <tbody>
                    <tr data-ng-repeat="r in volumeList track by $index">
                        <td data-ng-repeat="v in r track by v.volId">
                            <div
                                title="{{ v.isVisibleWithTallies ? 'Deselect' : 'Select' }} volume"
                                style="display: inline-block; cursor: pointer; white-space: nowrap; min-height: 25px;"
                                data-ng-click="toggleVolume(v)">
                                    <span class="glyphicon"
                                        data-ng-class="v.isVisibleWithTallies ? 'glyphicon-check' : 'glyphicon-unchecked'"></span>
                                <span style="font-weight: 500;">{{ v.name }}</span>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        `,
        controller: function($scope) {
            $scope.allVolumesVisible = false;
            $scope.numVolumeCols = 5;
            $scope.isVolumeListExpanded = false;
            $scope.volumeList = null;
            const volumeIds = cloudmcService.getNonGraveyardVolumes();

            function getVolumes() {
                return volumeIds.map(x => cloudmcService.getVolumeById(x));
            }

            $scope.buildVolumeList = () => {
                if (! $scope.volumeList) {
                    const vols = getVolumes();
                    if (! $scope.numVolumeCols) {
                        return vols;
                    }
                    const v = [];
                    for (let i = 0; i < vols.length; i += $scope.numVolumeCols) {
                        v.push(vols.slice(i, i + $scope.numVolumeCols));
                    }
                    $scope.volumeList = v;
                }
                return true;
            };

            $scope.toggleAllVolumes = () => {
                $scope.allVolumesVisible = ! $scope.allVolumesVisible;
                for (const v of getVolumes()) {
                    if (v.isVisibleWithTallies !== $scope.allVolumesVisible) {
                        $scope.toggleVolume(v, false);
                    }
                }
                $scope.renderVolumes();
            };

            $scope.toggleVolume = (v, doRender=true) => {
                v.isVisibleWithTallies = ! v.isVisibleWithTallies;
                $scope.setVolumeVisible({
                    volId: v.volId,
                    isVisible: v.isVisibleWithTallies,
                });
                if (doRender) {
                    $scope.renderVolumes();
                }
            };

            $scope.toggleVolumeList = () => {
                $scope.isVolumeListExpanded = ! $scope.isVolumeListExpanded;
            };
        },
    };
});

SIREPO.app.directive('tallyViewer', function(appState, plotting, tallyService) {
    return {
        restrict: 'A',
        scope: {
            modelName: '@',
            reportId: '<',
        },
        template: `
            <div style="height: 90vh">
                <ul class="nav nav-tabs">
                    <li role="presentation" data-ng-class="{active: is2D()}">
                        <a href data-ng-click="setSelectedGeometry('2D')">2D</a>
                    </li>
                    <li role="presentation" data-ng-class="{active: is3D()}">
                        <a href data-ng-click="setSelectedGeometry('3D')">3D</a>
                    </li>
                </ul>
                <div data-ng-if="is3D()">
                    <div data-report-content="geometry3d" data-model-key="{{ modelName }}"></div>
                </div>
                <div data-ng-if="is2D()">
                    <div data-geometry-2d=""></div>
                </div>
            </div>
        `,
        controller: function($scope) {
            plotting.setTextOnlyReport($scope);
            $scope.load = json => {
                if (json.content) {
                    // old format, ignore
                    return;
                }
                tallyService.setFieldData(json.field_data, json.min_field, json.max_field);
            };

            $scope.setSelectedGeometry = d => {
                appState.models.tallyReport.selectedGeometry = d;
                appState.saveQuietly('tallyReport');
            };
            $scope.is2D = () => appState.applicationState().tallyReport.selectedGeometry === '2D';
            $scope.is3D = () => ! $scope.is2D();
            $scope.$on('openmcAnimation.changed', () => {
                // keep colorMap synchronized
                appState.models.tallyReport.colorMap = appState.models.openmcAnimation.colorMap;
                appState.saveQuietly('tallyReport');
            });

            $scope.$on('openmcAnimation.summaryData', (e, summaryData) => {
                if (summaryData.tally) {
                    tallyService.setOutlines(summaryData.tally, summaryData.outlines);
                }
            });

        },
        link: function link(scope, element) {
            plotting.linkPlot(scope, element);
        },
    };
});

SIREPO.app.directive('geometry2d', function(appState, cloudmcService, frameCache, panelState, tallyService) {
    return {
        restrict: 'A',
        scope: {},
        template: `
            <div class="row">
                <div class="form-horizontal" style="margin-top: 10px">
                     <div data-model-field="'axis'" data-model-name="modelName" data-label-size="2" data-field-size="2"></div>
                     <div class="col-md-6">
                       <div plane-position-slider=""></div>
                     </div>
                 </div>
             </div>
             <div data-report-content="heatmap" data-model-key="{{ modelName }}"></div>
        `,
        controller: function($scope) {
            $scope.modelName = 'tallyReport';
            const displayRanges = {};

            function buildTallyReport() {
                if (! tallyService.mesh) {
                    return;
                }
                const [z, x, y] = tallyReportAxes();
                const [n, m, l] = tallyReportAxisIndices();
                const ranges = tallyService.getMeshRanges();
                const pos = appState.models.tallyReport.planePos;

                // for now set the aspect ratio to something reasonable even if it distorts the shape
                const arRange = [0.50, 1.25];
                let ar = Math.max(
                    arRange[0],
                    Math.min(
                        arRange[1],
                        Math.abs(ranges[m][1] - ranges[m][0]) / Math.abs(ranges[l][1] - ranges[l][0])
                    )
                );
                const r =  {
                    aspectRatio: ar,
                    global_max: tallyService.maxField,
                    global_min: tallyService.minField,
                    threshold: appState.models.openmcAnimation.threshold,
                    title: `Score at ${z} = ${SIREPO.UTILS.roundToPlaces(appState.models.tallyReport.planePos, 6)}m`,
                    x_label: `${x} [m]`,
                    x_range: ranges[l],
                    y_label: `${y} [m]`,
                    y_range: ranges[m],
                    z_matrix: reorderFieldData(tallyService.mesh.dimension)[fieldIndex(pos, ranges[n], n)],
                    z_range: ranges[n],
                    overlayData: getOutlines(pos, ranges[n], n),
                };
                panelState.setData('tallyReport', r);
                $scope.$broadcast('tallyReport.reload', r);
            }

            function displayRangeIndices() {
                const r = tallyService.getMeshRanges();
                return [
                    displayRanges.x,
                    displayRanges.y,
                    displayRanges.z,
                ]
                    .map((x, i) => [fieldIndex(x.min, r[i], i), fieldIndex(x.max, r[i], i)]);
            }

            function fieldIndex(pos, range, dimIndex) {
                const d = tallyService.mesh.dimension[dimIndex];
                return Math.min(
                    d - 1,
                    Math.max(0, Math.floor(d * (pos - range[0]) / (range[1] - range[0])))
                );
            }

            function getOutlines(pos, range, dimIndex) {
                const outlines = [];
                const dim = SIREPO.GEOMETRY.GeometryUtils.BASIS()[dimIndex];
                for (const volId of cloudmcService.getNonGraveyardVolumes()) {
                    const v = cloudmcService.getVolumeById(volId);
                    if (! v.isVisibleWithTallies) {
                        continue;
                    }
                    const o = tallyService.getOutlines(volId, dim, fieldIndex(pos, range, dimIndex));
                    o.forEach((arr, i) => {
                        outlines.push({
                            name: `${v.name}-${i}`,
                            color: v.color,
                            data: arr,
                        });
                    });
                }
                return outlines;
            }

            function reorderFieldData(dims) {
                const [n, m, l] = tallyReportAxisIndices();
                const fd = tallyService.fieldData;
                const d = SIREPO.UTILS.reshape(fd, dims.slice().reverse());
                const inds = displayRangeIndices();
                let N = 1;
                for (const idx of inds) {
                    N *= (idx[1] - idx[0] + 1);
                }
                const ff = SIREPO.UTILS.reshape(
                    new Array(N),
                    [(inds[n][1] - inds[n][0] + 1), (inds[m][1] - inds[m][0] + 1), (inds[l][1] - inds[l][0] + 1)]
                );

                for (let k = 0; k <= (inds[n][1] - inds[n][0]); ++k) {
                    for (let j = 0; j <= (inds[m][1] - inds[m][0]); ++j) {
                        for (let i = 0; i <= (inds[l][1] - inds[l][0]); ++i) {
                            const v = [0, 0, 0];
                            v[l] = inds[l][0] + i;
                            v[m] = inds[m][0] + j;
                            v[n] = inds[n][0] + k;
                            ff[k][j][i] = d[v[2]][v[1]][v[0]];
                        }
                    }
                }
                return ff;
            }

            function tallyReportAxes() {
                return [
                    appState.models.tallyReport.axis,
                    ...SIREPO.GEOMETRY.GeometryUtils.nextAxes(appState.models.tallyReport.axis).reverse()
                ];
            }

            function tallyReportAxisIndices() {
                return SIREPO.GEOMETRY.GeometryUtils.axisIndices(appState.models.tallyReport.axis);
            }

            function updateDisplayRange() {
                if (! tallyService.initMesh()) {
                    return;
                }
                SIREPO.GEOMETRY.GeometryUtils.BASIS().forEach(dim => {
                    displayRanges[dim] = tallyService.tallyRange(dim);
                });
                updateVisibleAxes();
                updateSliceAxis();
            }

            function updateSlice() {
                buildTallyReport();
                // save quietly but immediately
                appState.saveQuietly('tallyReport');
                appState.autoSave();
            }

            function updateSliceAxis() {
                function adjustToRange(val, range) {
                    if (val < range.min) {
                        return range.min;
                    }
                    if (val > range.max) {
                        return  range.max;
                    }
                    return range.min + range.step * Math.round((val - range.min) / range.step);
                }

                if (! tallyService.fieldData) {
                    return;
                }
                if (! tallyService.initMesh()) {
                    return ;
                }
                const r = tallyService.tallyRange(appState.models.tallyReport.axis, true);
                appState.models.tallyReport.planePos = adjustToRange(
                    appState.models.tallyReport.planePos,
                    r
                );
                updateSlice();
            }

            function updateVisibleAxes() {
                const v = {};
                SIREPO.GEOMETRY.GeometryUtils.BASIS().forEach(dim => {
                    v[dim] = true;
                    SIREPO.GEOMETRY.GeometryUtils.BASIS_VECTORS()[dim].forEach((bv, bi) => {
                        if (! bv && tallyService.mesh.dimension[bi] < SIREPO.APP_SCHEMA.constants.minTallyResolution) {
                            delete v[dim];
                        }
                    });
                });
                SIREPO.GEOMETRY.GeometryUtils.BASIS().forEach(dim => {
                    const s = ! Object.keys(v).length || dim in v;
                    panelState.showEnum('tallyReport', 'axis', dim, s);
                    if (! s && appState.models.tallyReport.axis === dim) {
                        appState.models.tallyReport.axis = Object.keys(v)[0];
                    }
                });
            }

            $scope.$on('tallyReport.summaryData', updateSliceAxis);
            appState.watchModelFields($scope, ['tallyReport.axis'], updateSliceAxis);
            appState.watchModelFields($scope, ['tallyReport.planePos'], updateSlice, true);
            $scope.$on('openmcAnimation.summaryData', updateDisplayRange);
            if (frameCache.hasFrames('openmcAnimation')) {
                panelState.waitForUI(updateDisplayRange);
            }
        },
    };
});

SIREPO.app.directive('geometry3d', function(appState, cloudmcService, plotting, plotToPNG, tallyService, volumeLoadingService, $rootScope) {
    return {
        restrict: 'A',
        scope: {
            modelName: '@',
            reportId: '<',
        },
        template: `
            <div data-ng-if="supportsColorbar()" class="col-sm-12">
                <div data-tally-volume-picker="" data-render-volumes="renderVolumes()" data-set-volume-visible="setVolumeVisible(volId, isVisible)"></div>
            </div>
            <div data-vtk-display="" class="vtk-display col-sm-11"
                  data-ng-style="sizeStyle()" data-show-border="true"
                  data-report-id="reportId" data-model-name="{{ modelName }}"
                  data-event-handlers="eventHandlers" data-reset-side="y" data-reset-direction="-1"
                  data-enable-axes="true" data-axis-cfg="axisCfg"
                  data-axis-obj="axisObj" data-enable-selection="true"></div>
            <div class="col-sm-1" style="padding-left: 0;" data-ng-show="supportsColorbar()">
                <div class="colorbar"></div>
            </div>
        `,
        controller: function($scope, $element) {
            const hasTallies = $scope.modelName === 'openmcAnimation';
            $scope.isClientOnly = true;

            // 3d geometry state
            const axes = {
                boxes: {},
                SCENE_BOX: '_scene',
            };
            const bundleByVolume = {};
            const coordMapper = new SIREPO.VTK.CoordMapper(
                new SIREPO.GEOMETRY.Transform(
                    new SIREPO.GEOMETRY.SquareMatrix([
                        [cloudmcService.GEOMETRY_SCALE, 0, 0],
                        [0, cloudmcService.GEOMETRY_SCALE, 0],
                        [0, 0, cloudmcService.GEOMETRY_SCALE],
                    ])
                )
            );
            let picker = null;
            let renderedFieldData = [];
            let selectedVolume = null;
            let vtkScene = null;

            // ********* 3d tally state and functions
            //TODO(pjm): these should be moved to a subdirective

            const colorbar = {
                element: null,
                pointer: null,
                THICKNESS: 30,
            };
            let tallyBundle = null;
            let tallyPolyData = null;
            const voxelPoly = [
                [0, 1, 2, 3],
                [4, 5, 6, 7],
                [4, 5, 1, 0],
                [3, 2, 6, 7],
                [4, 0, 3, 7],
                [1, 5, 6, 2],
            ];

            function addTally(data) {
                tallyPolyData = vtk.Common.DataModel.vtkPolyData.newInstance();
                buildVoxels();
                $rootScope.$broadcast('vtk.hideLoader');
                initAxes();
                buildAxes();
                vtkScene.renderer.resetCamera();
                vtkScene.render();
            }

            function buildVoxel(lowerLeft, wx, wy, wz, points, polys) {
                const pi = points.length / 3;
                points.push(...lowerLeft);
                points.push(...[lowerLeft[0] + wx, lowerLeft[1], lowerLeft[2]]);
                points.push(...[lowerLeft[0] + wx, lowerLeft[1] + wy, lowerLeft[2]]);
                points.push(...[lowerLeft[0], lowerLeft[1] + wy, lowerLeft[2]]);
                points.push(...[lowerLeft[0], lowerLeft[1], lowerLeft[2] + wz]);
                points.push(...[lowerLeft[0] + wx, lowerLeft[1], lowerLeft[2] + wz]);
                points.push(...[lowerLeft[0] + wx, lowerLeft[1] + wy, lowerLeft[2] + wz]);
                points.push(...[lowerLeft[0], lowerLeft[1] + wy, lowerLeft[2] + wz]);
                for (const r of voxelPoly) {
                    polys.push(4);
                    polys.push(...r.map(v => v + pi));
                }
            }

            function buildVoxels() {
                if (tallyBundle) {
                    vtkScene.removeActor(tallyBundle.actor);
                    picker.deletePickList(tallyBundle.actor);
                    tallyBundle = null;
                }
                if (! tallyService.initMesh()) {
                    return;
                }
                const [nx, ny, nz] = tallyService.mesh.dimension;
                const [wx, wy, wz] = [
                    (tallyService.mesh.upper_right[0] - tallyService.mesh.lower_left[0]) / tallyService.mesh.dimension[0],
                    (tallyService.mesh.upper_right[1] - tallyService.mesh.lower_left[1]) / tallyService.mesh.dimension[1],
                    (tallyService.mesh.upper_right[2] - tallyService.mesh.lower_left[2]) / tallyService.mesh.dimension[2],
                ];
                const [sx, sy, sz] = tallyService.mesh.upper_right.map(
                    (x, i) => Math.abs(x - tallyService.mesh.lower_left[i]) / tallyService.mesh.dimension[i]
                );
                const points = [];
                const polys = [];
                renderedFieldData = [];
                const fd = tallyService.fieldData;
                if (! fd) {
                    return;
                }
                for (let zi = 0; zi < nz; zi++) {
                    for (let yi = 0; yi < ny; yi++) {
                        for (let xi = 0; xi < nx; xi++) {
                            const f = fd[zi * nx * ny + yi * nx + xi];
                            if (! isInFieldThreshold(f)) {
                                continue;
                            }
                            renderedFieldData.push(f);
                            const p = [
                                xi * wx + tallyService.mesh.lower_left[0],
                                yi * wy + tallyService.mesh.lower_left[1],
                                zi * wz + tallyService.mesh.lower_left[2],
                            ];
                            buildVoxel(p, sx, sy, sz, points, polys);
                        }
                    }
                }
                tallyPolyData.getPoints().setData(new window.Float32Array(points), 3);
                tallyPolyData.getPolys().setData(new window.Uint32Array(polys));
                tallyPolyData.buildCells();

                tallyBundle = coordMapper.buildPolyData(
                    tallyPolyData,
                    {
                        lighting: false,
                    }
                );
                vtkScene.addActor(tallyBundle.actor);
                picker.addPickList(tallyBundle.actor);
                setTallyColors();
            }

            function isInFieldThreshold(value) {
                return value > appState.models.openmcAnimation.threshold;
            }

            function scoreUnits() {
                return SIREPO.APP_SCHEMA.constants.scoreUnits[appState.models.openmcAnimation.score] || '';
            }

            function setTallyColors() {
                const cellsPerVoxel = voxelPoly.length;
                $scope.colorScale = tallyService.colorScale($scope.modelName);
                colorbar.element.scale($scope.colorScale);
                colorbar.element.pointer = d3.select('.colorbar').call(colorbar.element);
                const sc = [];
                const o = Math.floor(255 * appState.models.openmcAnimation.opacity);
                for (const f of tallyService.fieldData) {
                    if (! isInFieldThreshold(f)) {
                        continue;
                    }
                    const c = SIREPO.VTK.VTKUtils.colorToFloat($scope.colorScale(f)).map(v => Math.floor(255 * v));
                    c.push(o);
                    for (let j = 0; j < cellsPerVoxel; j++) {
                        sc.push(...c);
                    }
                }
                tallyBundle.setColorScalarsForCells(sc, 4);
                tallyPolyData.modified();
                vtkScene.render();
            }

            function showFieldInfo(callData) {
                function info(field, pos) {
                    const p = pos.map(
                        x => SIREPO.UTILS.roundToPlaces(x, 4).toLocaleString(
                            undefined,
                            {
                                minimumFractionDigits: 3,
                            }
                        )
                    );
                    return {
                        info: `
                                ${SIREPO.UTILS.roundToPlaces(field, 3)}
                                ${scoreUnits()} at
                                (${p[0]}, ${p[1]}, ${p[2]})cm
                            `,
                    };
                }

                if (vtkScene.renderer !== callData.pokedRenderer) {
                    return;
                }
                const pos = callData.position;
                picker.pick([pos.x, pos.y, 0.0], vtkScene.renderer);
                const cid = picker.getCellId();
                if (cid < 0) {
                    $scope.$broadcast('vtk.selected', null);
                    return;
                }
                const f = renderedFieldData[Math.floor(cid / 6)];
                $scope.$broadcast(
                    'vtk.selected',
                    info(f, picker.getMapperPosition())
                );
                colorbar.element.pointer.pointTo(f);
            }

            // ********* 3d geometry functions

            function buildAxes(actor) {
                let boundsBox = null;
                let name = null;
                if (actor) {
                    const v = getVolumeByActor(actor);
                    name = v.name;
                    boundsBox = SIREPO.VTK.VTKUtils.buildBoundingBox(actor.getBounds());
                }
                else {
                    // always clear the scene box
                    name = axes.SCENE_BOX;
                    vtkScene.removeActor(axes.boxes[name]);
                    delete axes.boxes[name];
                    boundsBox = vtkScene.sceneBoundingBox();
                }
                if (! axes.boxes[name]) {
                    vtkScene.addActor(boundsBox.actor);
                }
                const bounds = boundsBox.actor.getBounds();
                axes.boxes[name] = boundsBox.actor;
                $scope.axisObj = new SIREPO.VTK.ViewPortBox(boundsBox.source, vtkScene.renderer);

                SIREPO.GEOMETRY.GeometryUtils.BASIS().forEach((dim, i) => {
                    $scope.axisCfg[dim].max = bounds[2 * i + 1];
                    $scope.axisCfg[dim].min = bounds[2 * i];
                });
            }

            function getVolumeByActor(a) {
                for (const volId in bundleByVolume) {
                    if (bundleByVolume[volId].actor === a) {
                        return cloudmcService.getVolumeById(volId);
                    }
                }
                return null;
            }

            function handlePick(callData) {
                function getClosestActor(pickedActors) {
                    for (const a of pickedActors) {
                        const v = getVolumeByActor(a);
                        if (v) {
                            return [a, v];
                        }
                    }
                    return [null, null];
                }

                if (vtkScene.renderer !== callData.pokedRenderer || hasTallies) {
                    return;
                }

                // regular clicks are generated when spinning the scene - we'll select/deselect with ctrl-click
                if (! callData.controlKey) {
                    return;
                }

                const pos = callData.position;
                picker.pick([pos.x, pos.y, 0.0], vtkScene.renderer);
                const [actor, v] = getClosestActor(picker.getActors());

                if (selectedVolume) {
                    vtkScene.removeActor(axes.boxes[selectedVolume.name]);
                    delete axes.boxes[selectedVolume.name];
                }
                if (v === selectedVolume) {
                    selectedVolume = null;
                    axes.boxes[axes.SCENE_BOX].getProperty().setOpacity(1);
                    buildAxes();
                }
                else {
                    axes.boxes[axes.SCENE_BOX].getProperty().setOpacity(0);
                    selectedVolume = v;
                    buildAxes(actor);
                }
                $scope.$apply(vtkScene.fsRenderer.resize());
            }

            function initAxes() {
                $scope.axisCfg = {};
                SIREPO.GEOMETRY.GeometryUtils.BASIS().forEach((dim, i) => {
                    $scope.axisCfg[dim] = {
                        dimLabel: dim,
                        label: dim + ' [m]',
                        numPoints: 2,
                        screenDim: dim === 'z' ? 'y' : 'x',
                        showCentral: false,
                    };
                });
            }

            function initVolume(volId, reader) {
                const v = cloudmcService.getVolumeById(volId);
                const a = volumeAppearance(v);
                const b = coordMapper.buildActorBundle(reader, a.actorProperties);
                bundleByVolume[volId] = b;
                vtkScene.addActor(b.actor);
                $scope.setVolumeVisible(volId, v[a.visibilityKey]);
                if (! hasTallies) {
                    picker.addPickList(b.actor);
                }
            }

            function model() {
                return appState.models[$scope.modelName];
            }

            function setGlobalProperties() {
                if (! vtkScene || ! vtkScene.renderer) {
                    return;
                }
                vtkScene.setBgColor(model().bgColor);
                updateMarker();
                for (const volId in bundleByVolume) {
                    const b = bundleByVolume[volId];
                    const a = volumeAppearance(cloudmcService.getVolumeById(volId));
                    b.setActorProperty(
                        'opacity',
                        a.actorProperties.opacity * model().opacity
                    );
                    b.setActorProperty(
                        'edgeVisibility',
                        a.actorProperties.edgeVisibility
                    );
                }
                vtkScene.render();
            }

            function updateMarker() {
                vtkScene.isMarkerEnabled = model().showMarker === '1';
                vtkScene.refreshMarker();
            }

            function volumesLoaded() {
                if (! vtkScene) {
                    // volumesLoaded may be called after the component was destroyed
                    return;
                }
                setGlobalProperties();
                $rootScope.$broadcast('vtk.hideLoader');
                initAxes();
                buildAxes();
                $scope.$apply(vtkScene.fsRenderer.resize());
            }

            function volumeAppearance(v) {
                if (hasTallies) {
                    return {
                        actorProperties: {
                            color: [0.75, 0.75, 0.75],
                            opacity: 0.1,
                            edgeVisibility: false,
                        },
                        visibilityKey: 'isVisibleWithTallies',
                    };
                }
                return {
                    actorProperties: {
                        color: v.color,
                        opacity: v.opacity,
                        edgeVisibility: model().showEdges === '1',
                    },
                    visibilityKey: 'isVisible',
                };
            }

            // the vtk teardown is handled in vtkPlotting
            $scope.destroy = () => {
                vtkScene = null;
                plotToPNG.destroyVTK($element);
            };

            $scope.init = () => {};

            $scope.resize = () => {
                //TODO(pjm): reposition camera?
            };

            $scope.renderVolumes = () => {
                appState.saveChanges('volumes');
                buildAxes();
                vtkScene.render();
            };

            $scope.sizeStyle = () => {
                if (hasTallies) {
                    return {};
                }
                // 53 legend size + 35 bottom panel padding
                const ph = Math.ceil(
                    $(window).height() - ($($element).offset().top + 53 + 35));
                const pw = Math.ceil($($element).width() - 1);
                return {
                    width: `${Math.min(ph, pw)}px`,
                    margin: '0 auto',
                };
            };

            $scope.supportsColorbar = () => hasTallies;

            $scope.$on('vtk-init', (e, d) => {
                $rootScope.$broadcast('vtk.showLoader');
                colorbar.element = Colorbar()
                    .margin({top: 5, right: colorbar.THICKNESS + 20, bottom: 5, left: 0})
                    .thickness(colorbar.THICKNESS)
                    .orient('vertical')
                    .barlength($('.vtk-canvas-holder').height())
                    .origin([0, 0]);
                vtkScene = d;
                const ca = vtk.Rendering.Core.vtkAnnotatedCubeActor.newInstance();
                vtk.Rendering.Core.vtkAnnotatedCubeActor.Presets.applyPreset('default', ca);
                const df = ca.getDefaultStyle();
                df.fontFamily = 'Arial';
                df.faceRotation = 45;
                ca.setDefaultStyle(df);

                vtkScene.setMarker(
                    SIREPO.VTK.VTKUtils.buildOrientationMarker(
                        ca,
                        vtkScene.renderWindow.getInteractor(),
                        vtk.Interaction.Widgets.vtkOrientationMarkerWidget.Corners.TOP_RIGHT
                    )
                );
                updateMarker();

                picker = vtk.Rendering.Core.vtkCellPicker.newInstance();
                picker.setPickFromList(true);
                vtkScene.renderWindow.getInteractor().onLeftButtonPress(handlePick);
                if (hasTallies) {
                    //TODO(pjm): this should only be enabled for hover, see #6039
                    // vtkScene.renderWindow.getInteractor().onMouseMove(showFieldInfo);
                }

                const vols = cloudmcService.getNonGraveyardVolumes();
                vtkScene.render();
                volumeLoadingService.loadVolumes(vols, initVolume, volumesLoaded);
                if (hasTallies && tallyService.fieldData) {
                    addTally(tallyService.fieldData);
                }
                vtkScene.resetView();

                plotToPNG.initVTK($element, vtkScene.renderer);
            });

            $scope.setVolumeVisible = (volId, isVisible) => {
                bundleByVolume[volId].actor.setVisibility(isVisible);
            };

            if (! hasTallies) {
                $scope.$on('sr-volume-visibility-toggled', (event, volId, isVisible) => {
                    $scope.setVolumeVisible(volId, isVisible);
                    vtkScene.render();
                });

                $scope.$on('sr-volume-property.changed', (event, volId, prop, val) => {
                    bundleByVolume[volId].setActorProperty(prop, val);
                    vtkScene.render();
                });

                $scope.$on($scope.modelName + '.changed', setGlobalProperties);
            }

            if (hasTallies) {
                $scope.$on('openmcAnimation.summaryData', () => {
                    if (vtkScene) {
                        $rootScope.$broadcast('vtk.showLoader');
                        addTally(tallyService.fieldData);
                    }
                });
            }

        },
        link: function link(scope, element) {
            plotting.linkPlot(scope, element);
        },
    };
});

SIREPO.app.directive('compoundField', function() {
    return {
        restrict: 'A',
        scope: {
            field1: '@',
            field2: '@',
            field2Size: '@',
            modelName: '=',
            model: '=',
        },
        //TODO(pjm): couldn't find a good way to layout fields together without table
        template: `
          <div class="row">
            <table><tr><td>
              <div data-field-editor="field1" data-label-size="0"
                data-field-size="12" data-model-name="modelName" data-model="model"></div>
            </td><td>
              <div data-ng-attr-style="margin-left: -27px; width: {{ field2Size }}">
                <div data-field-editor="field2" data-label-size="0"
                  data-field-size="12" data-model-name="modelName"
                  data-model="model"></div>
              </div>
            </td></tr></table>
          </div>
        `,
    };
});

SIREPO.app.directive('volumeSelector', function(appState, cloudmcService, panelState, $rootScope) {
    return {
        restrict: 'A',
        scope: {},
        template: `
            <div style="padding: 0.5ex 1ex; border-bottom: 1px solid #ddd;">
              <div style="display: inline-block; cursor: pointer"
                data-ng-click="toggleAll()">
                <span class="glyphicon"
                  data-ng-class="allVisible ? 'glyphicon-check' : 'glyphicon-unchecked'"></span>
              </div>
            </div>
            <div id="sr-volume-list" data-ng-style="heightStyle()">
              <div class="sr-hover-row" data-ng-repeat="row in rows track by $index"
                style="padding: 0.5ex 0 0.5ex 1ex; white-space: nowrap; overflow: hidden"
                data-ng-class="{'bg-warning': ! row.material.density}">
                <div style="position: relative">
                  <div
                    style="display: inline-block; cursor: pointer; white-space: nowrap; min-height: 25px;"
                    data-ng-click="toggleSelected(row)">
                    <span class="glyphicon"
                      data-ng-class="row.isVisible ? 'glyphicon-check' : 'glyphicon-unchecked'"></span>
                    <b>{{ row.name }}</b>
                  </div>
                  <div style="position: absolute; top: 0px; right: 5px">
                    <button data-ng-click="editMaterial(row)"
                      class="btn btn-info btn-xs sr-hover-button">Edit</button>
                  </div>
                  <div data-ng-show="row.isVisible">
                    <div class="col-sm-3">
                      <input
                        id="volume-{{ row.name }}-color" type="color"
                        class="sr-color-button" data-ng-model="row.color"
                        data-ng-change="broadcastVolumePropertyChanged(row, 'color')" />
                    </div>
                    <div class="col-sm-9" style="margin-top: 10px">
                      <input
                        id="volume-{{ row.name }}-opacity-range" type="range"
                        min="0" max="1.0" step="0.01" data-ng-model="row.opacity"
                        data-ng-change="broadcastVolumePropertyChanged(row, 'opacity')" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
        `,
        controller: function($scope, $window) {
            $scope.allVisible = true;
            let editRowKey = null;
            let prevOffset = 0;

            function loadRows() {
                $scope.rows = [];
                for (const n in appState.models.volumes) {
                    const row = appState.models.volumes[n];
                    row.key = n;
                    if (! row.color) {
                        row.name = n;
                        row.color = randomColor();
                        row.opacity = 0.3;
                        row.isVisible = true;
                        row.isVisibleWithTallies = false;
                    }
                    if (cloudmcService.isGraveyard(row)) {
                        continue;
                    }
                    $scope.rows.push(row);
                }
                $scope.rows.sort((a, b) => a.name.localeCompare(b.name));
            }

            function randomColor() {
                return SIREPO.VTK.VTKUtils.colorToHex(
                    Array(3).fill(0).map(() => Math.random()));
            }

            function unloadMaterial() {
                appState.removeModel('material');
                editRowKey = null;
            }

            $scope.broadcastVolumePropertyChanged = (row, prop) => {
                appState.saveQuietly('volumes');
                $rootScope.$broadcast(
                    'sr-volume-property.changed',
                    row.volId,
                    prop,
                    row[prop]);
            };

            $scope.editMaterial = (row) => {
                if (! row.material) {
                    row.material = appState.setModelDefaults(
                        {
                            name: row.name,
                        },
                        'material');
                }
                editRowKey = row.key;
                appState.models.material = appState.clone(row.material);
                panelState.showModalEditor('material');
            };

            $scope.heightStyle = () => {
                const el = $('#sr-volume-list:visible');
                const offset = el.length ? el.offset().top : prevOffset;
                // keep previous offset in case the element is hidden and then restored
                prevOffset = offset;
                return {
                    // bottom padding is 35px
                    //   .panel margin-bottom: 20px
                    //   .panel-body padding: 15px
                    height: `calc(100vh - ${Math.ceil(offset) + 35}px)`,
                    overflow: 'auto',
                };
            };

            $scope.toggleAll = () => {
                $scope.allVisible = ! $scope.allVisible;
                Object.values(appState.models.volumes).forEach(v => {
                    if (cloudmcService.isGraveyard(v)) {
                        return;
                    }
                    if (v.isVisible !== $scope.allVisible) {
                        $scope.toggleSelected(v, true);
                    }
                });
                appState.saveChanges('volumes');
            };

            $scope.toggleSelected = (row, noSave) => {
                row.isVisible = ! row.isVisible;
                if (! noSave) {
                    appState.saveChanges('volumes');
                }
                $rootScope.$broadcast(
                    'sr-volume-visibility-toggled',
                    row.volId,
                    row.isVisible);
            };

            $scope.$on('material.changed', () => {
                if (editRowKey) {
                    const r = appState.models.volumes[editRowKey];
                    r.material = appState.models.material;
                    r.name = r.material.name;
                    appState.saveChanges('volumes', loadRows);
                    unloadMaterial();
                }
            });

            $scope.$on('cancelChanges', (event, name) => {
                if (editRowKey && name === 'material') {
                    appState.cancelChanges('volumes');
                    unloadMaterial();
                }
            });

            loadRows();
        },
    };
});

SIREPO.app.directive('materialComponents', function(appState, panelState) {
    return {
        restrict: 'A',
        scope: {},
        template: `
              <table class="table table-hover table-condensed">
                <tr data-ng-init="ci = $index"
                    data-ng-repeat="c in appState.models.material.components track by $index">
                  <td data-ng-repeat="fieldInfo in componentInfo(ci) track by fieldTrack(ci, $index)">
                    <div data-ng-if="fieldInfo.field">
                      <div style="font-size: 13px" data-label-with-tooltip="" data-label="{{ fieldInfo.label }}"
                        data-tooltip="{{ fieldInfo.tooltip }}"></div>
                      <div class="row" data-field-editor="fieldInfo.field"
                        data-field-size="12" data-model-name="'materialComponent'"
                        data-model="c" data-label-size="0"></div>
                    </div>
                  </td>
                  <td>
                    <div class="sr-button-bar-parent pull-right">
                      <div class="sr-button-bar">
                        <button data-ng-click="deleteComponent($index)"
                          class="btn btn-danger btn-xs">
                          <span class="glyphicon glyphicon-remove"></span>
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="width: 15em">
                    <b>Add Component</b>
                      <select class="form-control" data-ng-model="selectedComponent"
                        data-ng-options="item[0] as item[1] for item in componentEnum"
                        data-ng-change="addComponent()"></select>
                  </td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                </tr>
              </table>
        `,
        controller: function($scope, $element) {
            const componentInfo = [];
            $scope.appState = appState;
            $scope.selectedComponent = '';
            $scope.componentEnum = SIREPO.APP_SCHEMA.enum.MaterialComponent;
            const fieldsByComponent = {
                add_element: [
                    'percent_with_type',
                    'enrichment_with_type',
                    'enrichment_target',
                ],
                add_elements_from_formula: [
                    'percent_type',
                    'enrichment_with_type',
                    'enrichment_target',
                ],
                add_macroscopic: [],
                add_nuclide: ['percent_with_type'],
                add_s_alpha_beta: ['fraction'],
            };
            const fieldInfo = {};

            function buildFieldInfo() {
                const mi = appState.modelInfo('materialComponent');
                for (const p in fieldsByComponent) {
                    fieldsByComponent[p].unshift('component', 'name');
                    fieldInfo[p] = [];
                    for (const f of fieldsByComponent[p]) {
                        fieldInfo[p].push({
                            field: f,
                            label: mi[f][0],
                            tooltip: mi[f][3],
                        });
                    }
                    while (fieldInfo[p].length < 5) {
                        fieldInfo[p].push({
                            field: '',
                        });
                    }
                }
            }

            $scope.addComponent = () => {
                if (! $scope.selectedComponent) {
                    return;
                }
                var c = appState.models.material;
                if (! c.components) {
                    c.components = [];
                }
                var m = appState.setModelDefaults({}, 'materialComponent');
                // use the previous percent_type
                if (c.components.length) {
                    m.percent_type = c.components[c.components.length - 1].percent_type;
                }
                m.component = $scope.selectedComponent;
                c.components.push(m);
                $scope.selectedComponent = '';
                panelState.waitForUI(() => {
                    $($element).find('.model-materialComponent-name input').last().focus();
                });
            };

            $scope.componentInfo = idx => {
                const c = appState.models.material.components[idx];
                componentInfo[idx] = fieldInfo[c.component];
                return componentInfo[idx];
            };

            $scope.deleteComponent = idx => {
                appState.models.material.components.splice(idx, 1);
            };

            $scope.fieldTrack = (componentIndex, idx) => {
                var c = appState.models.material.components[componentIndex];
                return c.component + idx;
            };

            buildFieldInfo();
        },
    };
});

SIREPO.app.directive('componentName', function(appState, requestSender) {
    var requestIndex = 0;
    return {
        restrict: 'A',
        require: 'ngModel',
        link: function(scope, element, attrs, ngModel) {

            scope.isRequired = () => true;

            ngModel.$parsers.push(value => {
                if (ngModel.$isEmpty(value)) {
                    return null;
                }
                requestIndex++;
                const currentRequestIndex = requestIndex;
                requestSender.sendStatelessCompute(
                    appState,
                    data => {
                        // check for a stale request
                        if (requestIndex != currentRequestIndex) {
                            return;
                        }
                        ngModel.$setValidity('', data.error ? false : true);
                    },
                    {
                        method: 'validate_material_name',
                        args: {
                            name: value,
                            component: scope.model.component,
                        }
                    }
                );


                return value;
            });
            ngModel.$formatters.push(value => {
                if (ngModel.$isEmpty(value)) {
                    return value;
                }
                return value.toString();
            });
        }
    };
});

SIREPO.app.directive('multiLevelEditor', function(appState, panelState) {
    return {
        restrict: 'A',
        scope: {
            modelName: '@multiLevelEditor',
            model: '=',
            field: '=',
        },
        template: `
          <div style="position: relative; top: -5px; background: rgba(0, 0, 0, 0.05);
            border: 1px solid lightgray; border-radius: 3px; padding-top: 5px;
            margin: 0 15px">
            <div class="form-group">
              <div data-field-editor="'_type'" data-model-name="modelName"
                data-model="model[field]" data-label-size="0"></div>
            </div>
            <div data-ng-repeat="v in viewFields track by v.track">
              <div class="form-group">
                <div class="col-sm-11 col-sm-offset-1">
                  <div data-field-editor="v.field" data-model-name="model[field]._type"
                    data-label-size="5"
                    data-model="model[field]"></div>
                </div>
              </div>
            </div>
          </div>
        `,
        controller: function($scope) {
            const TYPE_NONE = 'None';

            function setView() {
                if (type() && type() !== TYPE_NONE) {
                    $scope.viewFields = SIREPO.APP_SCHEMA.view[type()].advanced
                        .map(f => {
                            return {
                                field: f,
                                track: type() + f,
                            };
                        });
                }
                else {
                    $scope.viewFields = null;
                }
            }

            function type() {
                return $scope.model[$scope.field]._type;
            }

            $scope.$watch('model[field]._type', (newValue, oldValue) => {
                if (! $scope.model) {
                    return;
                }
                if (panelState.isActiveField($scope.modelName, '_type')) {
                    if (newValue !== oldValue && newValue) {
                        $scope.model[$scope.field] = {
                            _type: type(),
                        };
                        if (newValue !== TYPE_NONE) {
                            appState.setModelDefaults(
                                $scope.model[$scope.field],
                                type(),
                            );
                        }
                    }
                }
                setView();
            });
        },
    };
});

SIREPO.app.directive('point3d', function() {
    return {
        restrict: 'A',
        scope: {
            model: '=',
            field: '=',
        },
        template: `
            <div data-ng-repeat="v in model[field] track by $index"
              style="display: inline-block; width: 7em; margin-right: 5px;" >
              <input class="form-control" data-string-to-number="Float"
                data-ng-model="model[field][$index]"
                style="text-align: right" required />
            </div>
        `,
    };
});

SIREPO.app.directive('sourcesOrTalliesEditor', function(appState, panelState) {
    return {
        restrict: 'A',
        scope: {
            modelName: '=',
            model: '=',
            field: '=',
        },
        template: `
            <div class="col-sm-7">
              <button class="btn btn-xs btn-info pull-right"
                data-ng-click="addItem()">
                <span class="glyphicon glyphicon-plus"></span> Add {{ itemName }}</button>
            </div>
            <div class="col-sm-12">
              <table data-ng-if="model[field].length"
                style="width: 100%; table-layout: fixed; margin-bottom: 10px"
                class="table table-hover">
                <colgroup>
                  <col>
                  <col style="width: 8em">
                </colgroup>
                <thead>
                  <tr>
                    <th>{{ itemHeading }}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr data-ng-repeat="m in model[field] track by $index">
                    <td>
                      <div style="text-overflow: ellipsis; overflow: hidden; white-space: nowrap">
                        {{ description(m) }}
                      </div>
                    </td>
                    <td>
                      <button class="btn btn-xs btn-info" style="width: 5em"
                        data-ng-click="editItem(m)">Edit</button>
                      <button data-ng-click="removeItem(m)"
                        class="btn btn-danger btn-xs"><span
                          class="glyphicon glyphicon-remove"></span></button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
        `,
        controller: function($scope) {
            const childModel = $scope.field === 'sources' ? 'source' : 'tally';
            const infoFields = {
                box: ['lower_left', 'upper_right'],
                cartesianIndependent: SIREPO.GEOMETRY.GeometryUtils.BASIS(),
                cylindricalIndependent: ['r', 'phi', 'z'],
                point: ['xyz'],
                sphericalIndependent: ['r', 'theta', 'phi'],
                maxwell: ['theta'],
                muir: ['e0', 'm_rat', 'kt'],
                normal: ['mean_value', 'std_dev'],
                powerLaw: ['a', 'b'],
                uniform: ['a', 'b'],
                watt: ['a', 'b'],
            };

            $scope.itemName = childModel === 'source' ? 'Source' : 'Tally';
            $scope.itemHeading = childModel === 'source' ? 'Space' : 'Tally';

            function nextIndex() {
                return $scope.model[$scope.field].length;
            }

            function editChild(model) {
                appState.models[childModel] = model;
                panelState.showModalEditor(childModel);
            }

            $scope.addItem = () => {
                editChild(appState.setModelDefaults({
                    _index: nextIndex(),
                }, childModel));
            };

            $scope.description = m => {
                if (childModel === 'source')  {
                    return m.type === 'file' && m.file
                         ? `File(filename=${m.file })`
                         : sourceInfo('SpatialDistribution', m.space);
                }
                return tallyInfo(m);
            };

            function tallyInfo(model) {
                return model.name + ': ' + model.scores.map(t => t.score).join(', ');
            }

            function sourceInfo(modelType, model) {
                let res = appState.enumDescription(modelType, model._type);
                if (infoFields[model._type]) {
                    res += '(';
                    for (const f of infoFields[model._type]) {
                        if (! model[f]) {
                            continue;
                        }
                        res += `${f}=`;
                        if (model[f]._type) {
                            res += sourceInfo('ProbabilityDistribution', model[f]);
                        }
                        else {
                            res += model[f];
                        }
                        res += ' ';
                    }
                    res = res.trim() + ')';
                }
                else if (model.probabilityValue) {
                    const MAX_VALUES = 3;
                    res += '(';
                    for (let i = 0; i < MAX_VALUES; i++) {
                        if (model.probabilityValue[i]
                            && model.probabilityValue[i].p) {
                            res += `(${model.probabilityValue[i].x},${model.probabilityValue[i].p}) `;
                        }
                    }
                    if (model.probabilityValue[MAX_VALUES]
                        && model.probabilityValue[MAX_VALUES].p) {
                        res += '...';
                    }
                    res = res.trim() + ')';
                }
                return res + ' ';
            }

            $scope.editItem = model => {
                editChild(model);
            };

            $scope.removeItem = model => {
                const c = [];
                for (const m of $scope.model[$scope.field]) {
                    if (m._index != model._index) {
                        m._index = c.length;
                        c.push(m);
                    }
                }
                $scope.model[$scope.field] = c;
            };

            $scope.$on('modelChanged', function(event, name) {
                if (name === childModel) {
                    const m = appState.models[childModel];
                    $scope.model[$scope.field][m._index] = m;
                    appState.removeModel(childModel);
                    appState.saveChanges($scope.modelName);
                }
            });
        },
    };
});

// A special enum editor which groups items within optgroups
SIREPO.app.directive('tallyScoreGroup', function() {
    return {
        restrict: 'A',
        scope: {
            model: '=',
            field: '=',
            enum: '=',
        },
        template: `
            <select class="form-control" data-ng-model="model[field]"
              data-ng-options="item.v as item.l group by item.g for item in items">
            </select>
        `,
        controller: function($scope) {
            // enums are in order by group
            const groups = {
                flux: 'Flux scores',
                absorption: 'Reaction scores',
                'delayed-nu-fission': 'Particle production scores',
                current: 'Miscellaneous scores',
            };
            $scope.items = [];
            let g = '';
            for (const t of $scope.enum.TallyScore) {
                const v = t[0];
                if (groups[v]) {
                    g = groups[v];
                }
                $scope.items.push({
                    v: v,
                    l: t[1],
                    g: g,
                });
            }
        },
    };
});

SIREPO.app.directive('tallyAspects', function() {

    const aspects = SIREPO.APP_SCHEMA.enum.TallyAspect;

    function template() {
        const numCols = 4;
        const numRows = Math.ceil(aspects.length / numCols);
        let t = '';
        for (let i = 0; i < numRows; ++i) {
            t += '<div class="row">';
            for (let j = 0; j < numCols; ++j) {
                const n = i * numRows + j;
                const label = aspects[n][1];
                const val = aspects[n][0];
                t += `
                  <div style="position: relative; top: -25px">
                    <div class="col-sm-offset-5 col-sm-6">
                        <label><input type="checkbox" data-ng-model="selectedAspects['${val}']" data-ng-change="toggleAspect('${val}')"> ${label}</label>
                    </div>
                  </div>
                `;
            }
            t += '</div>';
        }
        return t;
    }

    return {
        restrict: 'A',
        scope: {
            model: '=',
            field: '=',
        },
        template: template(),
        controller: function($scope) {
            $scope.selectedAspects = {};
            for (const a of aspects) {
                $scope.selectedAspects[a[0]] = $scope.field.includes(a[0]);
            }

            $scope.toggleAspect = val => {
                if ($scope.selectedAspects[val]) {
                    $scope.field.push(val);
                }
                else {
                    $scope.field.splice($scope.field.indexOf(val), 1);
                }
            };
        },
    };
});

SIREPO.viewLogic('settingsView', function(appState, panelState, $scope) {

    function updateEditor() {
        panelState.showFields('reflectivePlanes', [
            ['plane1a', 'plane1b', 'plane2a', 'plane2b'],
            appState.models.reflectivePlanes.useReflectivePlanes === '1',
        ]);

        panelState.showField(
            $scope.modelName,
            'eigenvalueHistory',
            appState.models[$scope.modelName].run_mode === 'eigenvalue'
        );
    }

    $scope.whenSelected = updateEditor;

    $scope.watchFields = [
        [`${$scope.modelName}.run_mode`, 'reflectivePlanes.useReflectivePlanes'], updateEditor,
    ];

});

SIREPO.viewLogic('sourceView', function(appState, panelState, $scope) {
    function updateEditor() {
        const isFile = appState.models[$scope.modelName].type === 'file';
        panelState.showField($scope.modelName, 'file', isFile);
        $scope.$parent.advancedFields.forEach((x, i) => {
            panelState.showTab($scope.modelName, i + 1, ! isFile || x[0] === 'Type');
        });
    }

    $scope.whenSelected = updateEditor;

    $scope.watchFields = [
        ['source.type'], updateEditor,
    ];
});

SIREPO.viewLogic('tallyView', function(appState, panelState, $scope) {

    const ALL_TYPES = SIREPO.APP_SCHEMA.enum.TallyFilter
        .map(x => x[SIREPO.ENUM_INDEX_VALUE]);
    const inds = SIREPO.UTILS.indexArray(SIREPO.APP_SCHEMA.constants.maxFilters, 1);
    const TYPE_NONE = 'None';

    function type(index) {
        return appState.models[$scope.modelName][`filter${index}`]._type;
    }

    function updateEditor() {
        // can always select 'None'
        const assignedTypes = inds.map(i => type(i)).filter(x => x !== TYPE_NONE);
        // remove assigned types
        ALL_TYPES.forEach(x => {
            panelState.showEnum('filter', '_type', x, ! assignedTypes.includes(x));
        });
        // replace the type for this "instance"
        inds.forEach(i => {
            panelState.showEnum('filter', '_type', type(i), true, i - 1);
        });
    }

    $scope.whenSelected = updateEditor;

    $scope.watchFields = [
        inds.map(i => `${$scope.modelName}.filter${i}._type`), updateEditor,
    ];

});

SIREPO.viewLogic('materialView', function(appState, panelState, $scope) {

    let name = null;

    $scope.whenSelected = () => {
        $scope.appState = appState;
        name = model().name;
    };

    function isStd() {
        return model() && model().standardType !== 'None';
    }

    function model() {
        return appState.models[$scope.modelName];
    }

    function updateMaterial() {
        if (! model()) {
            return;
        }
        if (isStd()) {
            // don't change the name as it came from the loaded volume
            appState.models[$scope.modelName] = appState.setModelDefaults({name: name}, model().standardType);
        }
    }

    // only update when the user makes a change, not on the initial model load
    $scope.$watch(`appState.models['${$scope.modelName}']['standardType']`, (newVal, oldVal) => {
        if (oldVal === undefined || oldVal === newVal) {
            return;
        }
        updateMaterial();
    });

});

SIREPO.app.directive('simpleListEditor', function(panelState) {
    return {
        restrict: 'A',
        scope: {
            model: '=',
            field: '=',
            subModel: '=',
        },
        template: `
            <div data-ng-repeat="row in model[field] track by $index">
              <div class="form-group form-group-sm">
                <div data-field-editor="subField"
                  data-model-name="subModel" data-label-size="0"
                  data-field-size="10"
                  data-model="model[field][$index]"></div>
                <div class="col-sm-2" style="margin-top: 5px">
                  <button data-ng-click="removeIndex($index)"
                    class="btn btn-danger btn-xs"><span
                      class="glyphicon glyphicon-remove"></span></button>
                </div>
              </div>
            </div>
            <div class="form-group form-group-sm">
              <div data-field-editor="subField" data-model-name="subModel"
                data-field-size="10"
                data-label-size="0" data-model="newRowModel"></div>
            </div>
        `,
        controller: function($scope, $element) {
            $scope.subField = SIREPO.APP_SCHEMA.view[$scope.subModel].advanced[0];
            $scope.newRowModel = {};

            $scope.removeIndex = (idx) => {
                $scope.model[$scope.field].splice(idx, 1);
            };

            $scope.$watchCollection('newRowModel', (newValue, oldValue) => {
                if (newValue && newValue[$scope.subField]) {
                    $scope.model[$scope.field].push({
                        [$scope.subField]: newValue[$scope.subField],
                    });
                    $scope.newRowModel = {};
                    // the focus should now be set to the new field in the field array
                    panelState.waitForUI(() => {
                        $($element).find(
                            `.model-${$scope.subModel}-${$scope.subField} input`,
                        ).eq(-2).focus();
                });
                }
            });
        },
    };
});

SIREPO.app.directive('materialList', function(appState, cloudmcService) {
    return {
        restrict: 'A',
        scope: {
            model: '=',
            field: '=',
        },
        template: `
            <select class="form-control" data-ng-model="model[field]" data-ng-options="v.key as v.name for v in volumes"></select>
        `,
        controller: function($scope) {
            function initVolumes() {
                const res = [];
                const volumes = appState.applicationState().volumes;
                for (const k in volumes) {
                    if (cloudmcService.isGraveyard(volumes[k])) {
                        continue;
                    }
                    res.push({
                        key: k,
                        name: volumes[k].name,
                    });
                }
                res.sort((a, b) => a.name.localeCompare(b.name));
                return res;
            }
            $scope.volumes = initVolumes();
        },
    };
});

SIREPO.app.directive('planePositionSlider', function(appState, tallyService) {
    return {
        restrict: 'A',
        scope: {},
        template: `
            <div data-ng-show="hasSteps()">
                <div data-label-with-tooltip="" data-label="Plane position"></div>
                <div class="plane-pos-slider"></div>
                <div style="display:flex; justify-content:space-between;">
                     <span>{{ formatFloat(tallyService.tallyRange(appState.models.tallyReport.axis, true).min) }}</span>
                     <span>{{ formatFloat(tallyService.tallyRange(appState.models.tallyReport.axis, true).max) }}</span>
                </div>
            </div>
        `,
        controller: function($scope) {
            $scope.appState = appState;
            $scope.tallyService = tallyService;
            let planePosSlider = null;
            let hasSteps = false;

            function buildSlider(modelName, field, selectorString, range) {
                hasSteps = range.min != range.max;
                if (! hasSteps) {
                    return;
                }
                const sel = $(selectorString);
                const val = appState.models[modelName][field];
                const isMulti = Array.isArray(val);
                if (isMulti) {
                    if (val[0] < range.min) {
                        val[0] = range.min;
                    }
                    if (val[1] > range.max) {
                        val[1] = range.max;
                    }
                }
                sel.slider({
                    min: range.min,
                    max: range.max,
                    range: isMulti,
                    slide: (e, ui) => {
                        $scope.$apply(() => {
                            if (isMulti) {
                                appState.models[modelName][field][ui.handleIndex] = ui.value;
                            }
                            else {
                                appState.models[modelName][field] = ui.value;
                            }
                        });
                    },
                    step: range.step,
                });
                // jqueryui sometimes decrements the max by the step value due to floating-point
                // shenanigans. Reset it here
                sel.slider('instance').max = range.max;
                sel.slider('option', isMulti ? 'values' : 'value', val);
                sel.slider('option', 'disabled', range.min === range.max);
                return sel;
            }

            function updateSlider() {
                const r = tallyService.tallyRange(appState.models.tallyReport.axis, true);
                planePosSlider = buildSlider(
                    'tallyReport',
                    'planePos',
                    '.plane-pos-slider',
                    r
                );
            }

            $scope.formatFloat = val => SIREPO.UTILS.formatFloat(val, 4);
            $scope.hasSteps = () => hasSteps;

            appState.watchModelFields($scope, ['tallyReport.planePos', 'tallyReport.axis'], updateSlider, true);
            $scope.$on('tallyReport.summaryData', updateSlider);
            updateSlider();

            $scope.$on('$destroy', () => {
                if (planePosSlider) {
                    planePosSlider.slider('destroy');
                    planePosSlider = null;
                }
            });
        },
    };
});

SIREPO.viewLogic('openmcAnimationView', function(cloudmcService, $scope) {

    $scope.whenSelected = () => {
        cloudmcService.buildRangeDelegate($scope.modelName, 'opacity');
    };
    $scope.watchFields = [
        ['openmcAnimation.tally'], cloudmcService.validateSelectedTally,
    ];
});

SIREPO.viewLogic('geometry3DReportView', function(cloudmcService, $scope) {
    $scope.whenSelected = () => {
        cloudmcService.buildRangeDelegate($scope.modelName, 'opacity');
    };
});
