'use strict';

var srlog = SIREPO.srlog;
var srdbg = SIREPO.srdbg;

SIREPO.app.config(function() {
    SIREPO.PLOTTING_SUMMED_LINEOUTS = true;
    SIREPO.appFieldEditors +=
        `
            <div data-ng-switch-when="ReflectivityMaterial" data-ng-class="fieldClass">
              <input data-reflectivity-material="" data-ng-model="model[field]" class="form-control" required />
            </div>
            <div data-ng-switch-when="RSOptElements" class="col-sm-12">
              <div data-rs-opt-elements="" data-model="model" data-field="field" data-model-name="modelName" data-form="form" data-field-class="fieldClass"></div>
            </div>
        `
    SIREPO.appDownloadLinks = [
        '<li data-lineout-csv-link="x"></li>',
        '<li data-lineout-csv-link="y"></li>',
        '<li data-lineout-csv-link="full"></li>',
        '<li data-export-python-link="" data-report-title="{{ reportTitle() }}"></li>',
    ].join('');
});

SIREPO.app.factory('shadowService', function(appState, beamlineService, panelState, requestSender) {
    var self = {};
    self.getReportTitle = beamlineService.getReportTitle;

    function updateAutoTuningFields(item) {
        var modelName = item.type;
        panelState.showFields(modelName, [
            ['t_incidence', 't_reflection'], modelName == 'grating' || item.f_central == '0',
            'f_phot_cent', item.f_central == '1',
            'phot_cent', item.f_central == '1' && item.f_phot_cent == '0',
            'r_lambda', item.f_central == '1' && item.f_phot_cent == '1',
        ]);
    }

    function updateElementDimensionFields(item) {
        panelState.showFields(item.type, [
            'fshape', item.fhit_c == '1',
            [
                'halfWidthX1', 'halfWidthX2', 'halfLengthY1',
                'halfLengthY2',
            ], item.fhit_c == '1' && item.fshape == '1',
            [
                'externalOutlineMajorAxis', 'externalOutlineMinorAxis',
            ], item.fhit_c == '1' && (item.fshape == '2' || item.fshape == '3'),
            [
                'internalOutlineMajorAxis', 'internalOutlineMinorAxis',
            ], item.fhit_c == '1' && item.fshape == '3',
        ]);
    }

    function updateElementShapeFields(item) {
        panelState.showTab(
            item.type, 2,
            item.fmirr == '1' || item.fmirr == '2' || item.fmirr == '3'
                || item.fmirr == '4' || item.fmirr == '7');
    }

    function updateElementSurfaceFields(item) {
        panelState.showFields(item.type, [
            'f_default', item.f_ext == '0',
            'f_side', item.f_ext == '0' && item.fmirr == '4',
            'rmirr', item.f_ext == '1' && item.fmirr == '1',
            [
                'axmaj', 'axmin', 'ell_the',
            ], item.f_ext == '1' && (item.fmirr == '2' || item.fmirr == '7'),
            ['r_maj', 'r_min'], item.f_ext == '1' && item.fmirr == '3',
            'param', item.f_ext == '1' && item.fmirr == '4',
            ['ssour', 'simag', 'theta'], item.f_ext == '0' && item.f_default == '0',
            [
                'f_convex', 'fcyl',
            ], item.fmirr == '1' || item.fmirr == '2' || item.fmirr == '4'
                || item.fmirr == '7',
            'cil_ang', item.fcyl == '1'
                && (item.fmirr == '1' || item.fmirr == '2' || item.fmirr == '4'
                    || item.fmirr == '7'),
            'f_torus', item.fmirr == '3',
        ]);
    }

    self.computeModel = function(analysisModel) {
        return 'animation';
    };

    self.sendStatelessCompute = function(method, appState, callback, args) {
        requestSender.sendStatelessCompute(appState, callback,
            {
                method: method,
                args: args,
            }
        );
    };

    self.initAutoTuneView = function(scope, watchFields, callback) {
        self.initGeometryView(scope, watchFields, callback);
        var chain = scope.whenSelected;
        scope.whenSelected = function(item) {
            chain(item);
            updateAutoTuningFields(item);
        };
        scope.watchFields.push(['f_central', 'f_phot_cent'], updateAutoTuningFields);
    };

    self.initGeometryView = function(scope, watchFields, callback) {
        scope.whenSelected = function(item) {
            updateElementShapeFields(item);
            updateElementDimensionFields(item);
            updateElementSurfaceFields(item);
            callback(item);
        };
        scope.watchFields = [
            ['fmirr'], updateElementShapeFields,
            ['fhit_c', 'fshape'], updateElementDimensionFields,
            ['f_ext', 'f_default', 'fcyl'], updateElementSurfaceFields,
            watchFields, callback,
        ];
    };

    self.updateRayFilterFields = function() {
        var hasFilter = appState.models.rayFilter.f_bound_sour == '2';
        panelState.showField('rayFilter', 'distance', hasFilter);
        panelState.showRow('rayFilter', 'x1', hasFilter);
    };

    self.rsOptElementOffsetField = function(p) {
        return `${p}Offsets`;
    };

    self.updateRSOptElements = function() {
        const optElModel = 'rsOptElement';
        const optEls = SIREPO.APP_SCHEMA.constants.rsOptElements;
        const items = (appState.models.beamline || []).filter(i => optEls[i.type]);
        const els = appState.models.exportRsOpt.elements;
        for (const item of items) {
            let e = self.findRSOptElement(item.id);
            if (e) {
                // element name may have changed
                e.title = item.title;
                continue;
            }
            e = appState.setModelDefaults({}, optElModel);
            els.push(e);

            e.title = item.title;
            e.type = item.type;
            e.id = item.id;
            const props = optEls[item.type];
            for (const p in props) {
                appState.setFieldDefaults(
                    e,
                    self.rsOptElementOffsetField(p),
                    props[p].offsetInfo || SIREPO.APP_SCHEMA.constants.rsOptDefaultOffsetInfo[p],
                    true
                );
                e[p] = {
                    fieldNames: props[p].fieldNames,
                    initial: [],
                    offsets: [],
                };
                for (const f of props[p].fieldNames || []) {
                    e[p].initial.push(item[f] ? parseFloat(item[f]) : 0.0);
                }
            }
        }
        // remove outdated elements
        for (let i = els.length - 1; i >= 0; --i) {
            if (! beamlineService.getItemById(els[i].id)) {
                els.splice(i, 1);
            }
        }
        // put in beamline order
        let ids = items.map(function (i) {
            return i.id;
        });
        els.sort(function (e1, e2) {
            return ids.indexOf(e1.id) - ids.indexOf(e2.id);
        });
        appState.saveQuietly('exportRsOpt');
        return els;
    };

    self.findRSOptElement = function(id) {
        for (let e of appState.models.exportRsOpt.elements) {
            if (e.id === id) {
                return e;
            }
        }
        return null;
    };

    appState.setAppService(self);

    return self;
});

SIREPO.app.controller('BeamlineController', function (appState, beamlineService) {
    var self = this;
    self.appState = appState;
    self.beamlineService = beamlineService;
    self.beamlineModels = ['beamline'];
    //TODO(pjm): also KB Mirror and  Monocromator
    self.toolbarItemNames = ['aperture', 'obstacle', 'emptyElement', 'crystal', 'grating', 'lens', 'crl', 'mirror', 'watch', 'zonePlate'];
    self.prepareToSave = function() {};
    self.showBeamStatisticsReport = () => {
        return ['bendingMagnet', 'geometricSource', 'undulator'].indexOf(
            appState.models.simulation.sourceType) >= 0
            && appState.applicationState().beamline.length;
    };
});

SIREPO.app.controller('MLController', function (appState, panelState, persistentSimulation, requestSender, shadowService, $scope, $window) {
    const self = this;
    self.appState = appState;
    self.shadowService = shadowService;
    self.simScope = $scope;
    self.resultsFile = null;
    self.simComputeModel = 'machineLearningAnimation';
    self.simState = persistentSimulation.initSimulationState(self);

    self.createActivaitSimulation = () => {
        requestSender.sendRequest(
            'newSimulation',
            data => {
                requestSender.openSimulation(
                    'activait',
                    'data',
                    data.models.simulation.simulationId
                );
            },
            {
                folder: '/',
                name: appState.models.simulation.name,
                simulationType: 'activait',
                notes: 'rsopt results from SRW',
                sourceSimFile: self.resultsFile,
                sourceSimId: appState.models.simulation.simulationId,
                sourceSimType: 'srw',
            },
            err => {
                throw new Error('Error creating simulation' + err);
            }
        );
    };

    self.resultsFileURL = () => {
        return requestSender.formatUrl('downloadDataFile', {
            '<simulation_id>': appState.models.simulation.simulationId,
            '<simulation_type>': SIREPO.APP_SCHEMA.simulationType,
            '<model>': self.simComputeModel,
            '<frame>': SIREPO.nonDataFileFrame,
            '<suffix>': 'h5',
        });
    };

    self.simHandleStatus = data => {
        if (data.error) {
        }
        if ('percentComplete' in data && ! data.error) {
            if (self.simState.isStateCompleted()) {
                if (data.outputInfo && data.outputInfo.length) {
                    self.resultsFile = data.outputInfo[0].filename;
                }
            }
        }
    };

    self.startSimulation = model => {
        self.resultsFile = null;
        self.simState.saveAndRunSimulation([model, 'simulation']);
    };


});

SIREPO.app.controller('SourceController', function(appState, shadowService) {
    var self = this;
    self.appState = appState;
    self.shadowService = shadowService;
    self.isSource = function(name) {
        return appState.isLoaded() && appState.models.simulation.sourceType == name;
    };
});

SIREPO.beamlineItemLogic('crlView', function(panelState, $scope) {

    function updateCrlFields(item) {
        panelState.showFields('crl', [
            'lensDiameter', item.fhit_c == '1',
            'cil_ang', item.fcyl == '1' && item.fmirr != '5',
            [
                'rmirr', 'fcyl', 'useCCC',
                'initialCurvature',
            ], item.fmirr != '5',
        ]);
    }

    $scope.whenSelected = updateCrlFields;
    $scope.watchFields = [
        ['fhit_c', 'fmirr', 'fcyl'], updateCrlFields,
    ];
});

SIREPO.beamlineItemLogic('crystalView', function(panelState, shadowService, $scope) {

    function updateCrystalFields(item) {
        panelState.showFields(item.type, [
            ['mosaic_seed', 'spread_mos'], item.f_mosaic == '1',
            'thickness', item.f_mosaic == '1' || (item.f_mosaic == '0' && item.f_bragg_a == '1'),
            ['f_bragg_a', 'f_johansson'], item.f_mosaic == '0',
            'a_bragg', item.f_mosaic == '0' && item.f_bragg_a == '1',
            'order', item.f_mosaic == '0' && item.f_bragg_a == '1' && item.f_refrac == '1',
            'r_johansson', item.f_mosaic == '0' && item.f_johansson == '1',
        ]);
    }

    shadowService.initAutoTuneView(
        $scope,
        ['f_refrac', 'f_mosaic', 'f_bragg_a', 'f_johansson'],
        updateCrystalFields);
});

SIREPO.beamlineItemLogic('gratingView', function(panelState, shadowService, $scope) {

    function updateGratingFields(item) {
        panelState.showField('grating', 'rulingDensity', item.f_ruling == '0' || item.f_ruling == '1');
        panelState.showRow('grating', 'holo_r1', item.f_ruling == '2');
        ['holo_w', 'f_pw', 'f_pw_c', 'f_virtual'].forEach(function(f) {
            panelState.showField('grating', f, item.f_ruling == '2');
        });
        ['rulingDensityCenter', 'azim_fan', 'dist_fan', 'coma_fac'].forEach(function(f) {
            panelState.showField('grating', f, item.f_ruling == '3');
        });
        ['f_rul_abs', 'rulingDensityPolynomial', 'rul_a1', 'rul_a2', 'rul_a3', 'rul_a4'].forEach(function(f) {
            panelState.showField('grating', f, item.f_ruling == '5');
        });
        panelState.showField('grating', 'f_mono', item.f_central == '1');
        ['f_hunt', 'hunt_h', 'hunt_l', 'blaze'].forEach(function(f) {
            panelState.showField('grating', f, item.f_central == '1' && item.f_mono == '4');
        });
    }

    shadowService.initAutoTuneView(
        $scope,
        ['f_ruling', 'f_mono'],
        updateGratingFields);
});

SIREPO.beamlineItemLogic('mirrorView', function(panelState, shadowService, $scope) {

    function updateMirrorReflectivityFields(item) {
        panelState.showFields(item.type, [
            [
                'f_refl', 'reflectivityMinEnergy', 'reflectivityMaxEnergy',
            ], item.f_reflec == '1' || item.f_reflec == '2',
            [
                'prereflElement', 'prereflDensity', 'prereflStep',
            ], (item.f_reflec == '1' || item.f_reflec == '2') && item.f_refl == '0',
            [
                'f_thick', 'mlayerMinEnergy', 'mlayerMaxEnergy',
                'mlayerBilayerNumber', 'mlayerBilayerThickness', 'mlayerGammaRatio',
                'mlayerEvenRoughness', 'mlayerOddRoughness',
            ], (item.f_reflec == '1' || item.f_reflec == '2') && item.f_refl == '2',
        ]);
        panelState.showRow(
            item.type,
            'mlayerSubstrateMaterial',
            (item.f_reflec == '1' || item.f_reflec == '2') && item.f_refl == '2');
    }

    shadowService.initGeometryView(
        $scope,
        ['f_reflec', 'f_refl'],
        updateMirrorReflectivityFields);
});

var shadowPlotLogic = function(appState, panelState, shadowService, $scope) {
    // ColumnValue enum values which are in mm
    var MM_COLUMN_VALUES = ['1', '2', '3'];

    function updatePlotSizeFields() {
        var modelKey = $scope.modelData ? $scope.modelData.modelKey : $scope.modelName;
        var m = appState.models[modelKey];
        var showOverride = MM_COLUMN_VALUES.indexOf(m.x) >= 0 && MM_COLUMN_VALUES.indexOf(m.y) >= 0;
        panelState.showField($scope.modelName, 'overrideSize', showOverride);
        if (! showOverride) {
            m.overrideSize = '0';
        }
        panelState.showRow($scope.modelName, 'horizontalSize', m.overrideSize === '1');
    }

    $scope.whenSelected = updatePlotSizeFields;

    var name = $scope.modelData ? $scope.modelData.modelKey : $scope.modelName;
    $scope.watchFields = [
        [name + '.overrideSize', name + '.x', name + '.y'], updatePlotSizeFields,
    ];
};

[
    'plotXYReportView', 'initialIntensityReportView',
    'watchpointReportView',
].forEach(function(view) {
    SIREPO.viewLogic(view, shadowPlotLogic);
});

SIREPO.viewLogic('undulatorView', function(appState, panelState, shadowService, $scope) {

    function computeHarmonicPhotonEnergy() {
        if (appState.models.undulator.select_energy != 'harmonic') {
            return;
        }
        shadowService.sendStatelessCompute(
            'harmonic_photon_energy',
            appState,
            function(data) {
                if (appState.isLoaded()) {
                    var und = appState.models.undulator;
                    und.photon_energy = data.photon_energy.toFixed(2);
                    und.maxangle = data.maxangle.toFixed(4);
                }
            },
            {
                undulator: appState.models.undulator,
                undulatorBeam: appState.models.undulatorBeam,
            }
        );
    }

    function updateUndulatorFields() {
        var und = appState.models.undulator;
        panelState.enableFields('undulator', [
            ['photon_energy', 'maxangle'],  und.select_energy != 'harmonic',
        ]);
        panelState.showFields('undulator', [
            ['emin', 'emax', 'ng_e'], und.select_energy == 'range',
            'energy_harmonic', und.select_energy == 'harmonic',
            'photon_energy', und.select_energy == 'harmonic' || und.select_energy == 'single',
        ]);
    }

    $scope.whenSelected = function() {
        updateUndulatorFields();
        computeHarmonicPhotonEnergy();
    };

    $scope.watchFields = [
        ['undulator.select_energy'], updateUndulatorFields,
        [
            'undulator.energy_harmonic', 'undulator.k_horizontal',
            'undulator.k_vertical', 'undulator.period',
            'undulator.length', 'undulatorBeam.energy',
        ], computeHarmonicPhotonEnergy,
    ];
});

SIREPO.viewLogic('wigglerView', function(appState, panelState, shadowService, $scope) {

    function updateWigglerSettings() {
        var wiggler = appState.models.wiggler;
        panelState.showFields('wiggler', [
            'kValue', wiggler.b_from == '0',
            'trajFile', wiggler.b_from == '1' || wiggler.b_from == '2',
            'per', wiggler.b_from == '0' || wiggler.b_from == '2',
            'shift_x_value', wiggler.shift_x_flag == '5',
            'shift_betax_value', wiggler.shift_betax_flag == '5',
        ]);
    }

    $scope.whenSelected = function() {
        updateWigglerSettings();
        shadowService.updateRayFilterFields();
    };

    $scope.watchFields = [
        ['rayFilter.f_bound_sour'], shadowService.updateRayFilterFields,
        ['wiggler.b_from', 'wiggler.shift_x_flag', 'wiggler.shift_betax_flag'], updateWigglerSettings,
    ];
});

SIREPO.viewLogic('bendingMagnetView', function(appState, panelState, shadowService, $scope) {

    function computeFieldRadius() {
        let bm = appState.models.bendingMagnet;
        let isRadius = bm.calculateFieldMethod == 'radius';
        const c = 299792458;
        const e = 1e9 / c * appState.models.electronBeam.bener;
        if (isRadius) {
            if (bm.r_magnet) {
                bm.magneticField = e / bm.r_magnet;
            }
        }
        else if (bm.magneticField) {
            bm.r_magnet = e / bm.magneticField;
        }
        panelState.enableFields('bendingMagnet', [
            'r_magnet', isRadius,
            'magneticField', ! isRadius,
        ]);
    }

    $scope.whenSelected = () => {
        shadowService.updateRayFilterFields();
        computeFieldRadius();
    };
    $scope.watchFields = [
        ['rayFilter.f_bound_sour'], shadowService.updateRayFilterFields,
        [
            'bendingMagnet.calculateFieldMethod',
            'bendingMagnet.r_magnet',
            'bendingMagnet.magneticField',
        ], computeFieldRadius,
    ];
});

SIREPO.viewLogic('geometricSourceView', function(appState, panelState, shadowService, $scope) {

    function updateGeometricSettings() {
        var geo = appState.models.geometricSource;
        panelState.showFields('geometricSource', [
            ['wxsou', 'wzsou'], geo.fsour == '1' || geo.fsour == '2',
            ['sigmax', 'sigmaz'], geo.fsour == '3',
            ['sigdix', 'sigdiz'], geo.fdistr == '3',
            ['cone_max', 'cone_min'], geo.fdistr == '5',
            'wysou', geo.fsource_depth == '2',
            'sigmay', geo.fsource_depth == '3',
            'singleEnergyValue', geo.f_color == '1',
            ['ph1', 'ph2'], geo.f_color == '3',
            ['f_coher', 'pol_angle', 'pol_deg'], geo.f_polar == '1',
        ]);
        panelState.showFields('sourceDivergence', [
            ['hdiv1', 'hdiv2', 'vdiv1', 'vdiv2'], geo.fdistr == '1' || geo.fdistr == '2' || geo.fdistr == '3',
        ]);
    }

    $scope.whenSelected = function() {
        updateGeometricSettings();
        shadowService.updateRayFilterFields();
    };
    $scope.watchFields = [
        ['rayFilter.f_bound_sour'], shadowService.updateRayFilterFields,
        [
            'simulation.sourceType', 'geometricSource.fsour',
            'geometricSource.fdistr', 'geometricSource.fsource_depth',
            'geometricSource.f_color', 'geometricSource.f_polar',
        ], updateGeometricSettings,
    ];
});

SIREPO.viewLogic('exportRsOptView', function(appState, panelState, persistentSimulation, requestSender, $compile, $scope, $rootScope) {

    const self = this;
    self.simScope = $scope;
    self.simComputeModel = 'exportRsOpt';

    function addExportUI() {
        $('#sr-exportRsOpt-basicEditor .model-panel-heading-buttons').append(
            $compile(
                `
                    <a href data-ng-click="export()" class="dropdown-toggle" data-toggle="dropdown" title="Export ML Script">
                        <span class="sr-panel-heading glyphicon glyphicon-cloud-download" style="margin-bottom: 0"></span>
                   </a>
                `
            )($scope)
        );
    }

    self.simHandleStatus = data => {
        if (self.simState.isStopped()) {
            $('#sr-download-status').modal('hide');
        }
        if (self.simState.isStateCompleted()) {
            requestSender.newWindow('downloadDataFile', {
                '<simulation_id>': appState.models.simulation.simulationId,
                '<simulation_type>': SIREPO.APP_SCHEMA.simulationType,
                '<model>': 'exportRsOpt',
                '<frame>': SIREPO.nonDataFileFrame,
                '<suffix>': 'zip'
            });
        }
    };

    self.startSimulation = function(model) {
        $('#sr-download-status').modal('show');
        $rootScope.$broadcast('download.started', self.simState, 'Export Script', 'Exporting exportRsOpt.zip');
        self.simState.saveAndRunSimulation([model]);
    };

    self.simState = persistentSimulation.initSimulationState(self);

    $scope.export = () => {
        self.startSimulation($scope.modelName);
    };

    appState.whenModelsLoaded($scope, () => {
        addExportUI();
    });

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
            <div data-sim-conversion-modal="" data-conv-method="convert_to_srw"></div>
        `,
    };
});


SIREPO.app.directive('appHeader', function(appState) {
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
                  <li class="sim-section" data-ng-class="{active: nav.isActive('source')}"><a href data-ng-click="nav.openSection('source')"><span class="glyphicon glyphicon-flash"></span> Source</a></li>
                  <li class="sim-section" data-ng-class="{active: nav.isActive('beamline')}"><a href data-ng-click="nav.openSection('beamline')"><span class="glyphicon glyphicon-option-horizontal"></span> Beamline</a></li>
                  <li data-ng-if="showRsOptML()" class="sim-section" data-ng-class="{active: nav.isActive('ml')}"><a href data-ng-click="nav.openSection('ml')"><span class="glyphicon glyphicon-equalizer"></span> Machine Learning</a></li>
                </div>
              </app-header-right-sim-loaded>
              <app-settings>
                <div><a href data-ng-click="openSRWConfirm()"><span class="glyphicon glyphicon-upload"></span> Open as a New SRW Simulation</a></div>
              </app-settings>
              <app-header-right-sim-list>
                <ul class="nav navbar-nav sr-navbar-right">
                  <li><a href data-ng-click="nav.showImportModal()"><span class="glyphicon glyphicon-cloud-upload"></span> Import</a></li>
                </ul>
              </app-header-right-sim-list>
            </div>
        `,
        controller: function($scope) {
            $scope.openSRWConfirm = function() {
                $('#sr-conv-dialog').modal('show');
            };

            $scope.openExportRsOpt = function() {
                panelState.showModalEditor('exportRsOpt');
            };

            $scope.showRsOptML = function() {
                return SIREPO.APP_SCHEMA.feature_config.show_rsopt_ml &&
                    appState.models.beamline && appState.models.beamline.length > 0;
            };
        }
    };
});


SIREPO.app.directive('rsOptElements', function(appState, frameCache, panelState, shadowService, utilities, validationService) {
    return {
        restrict: 'A',
        scope: {
            field: '=',
            form: '=',
            model: '=',
        },
        template: `
            <div class="sr-object-table" style="border-width: 2px; border-color: black;">
              <div style="border-style: solid; border-width: 1px; border-color: #00a2c5;">
              <table class="table table-hover table-condensed" style="">
                <thead>
                    <tr>
                        <td style="font-weight: bold">Element</td>
                        <td style="font-weight: bold">Parameter Variations</td>
                    </tr>
                </thead>
                <tbody>
                    <tr data-ng-repeat="e in rsOptElements track by $index">
                      <td><div class="checkbox checkbox-inline"><label><input type="checkbox" data-ng-model="e.enabled" data-ng-change="updateTotalSamples()"> {{ e.title }}</label></div></td>
                      <td data-ng-repeat="p in rsOptParams" data-ng-if="hasFields(e, p)">
                        <div data-ng-show="showFields(e)" style="font-weight: bold; text-align: center; line-height: 2">{{ rsOptElementFields[$index] }}</div>
                        <div data-ng-show="showFields(e)" data-model-field="shadowService.rsOptElementOffsetField(p)" data-model-name="modelName" data-model-data="elementModelData(e)" data-label-size="0" data-custom-info="elementInfo(e, p)"></div>
                      </td>
                    </tr>
                </tbody>
              </table>
              </div>
            </div>
        `,
        controller: function($scope) {
            const els = SIREPO.APP_SCHEMA.constants.rsOptElements;
            let exportFields = ['exportRsOpt.elements', 'exportRsOpt.numSamples', 'exportRsOpt.scanType'];
            let elementFields = [];

            $scope.appState = appState;
            $scope.elementData = {};
            $scope.shadowService = shadowService;
            $scope.modelName = 'rsOptElement';
            $scope.rsOptElements = [];
            $scope.rsOptParams = [];
            $scope.rsOptElementFields = [];

            $scope.hasFields = function(e, p) {
                return els[e.type][p];
            };

            $scope.elementInfo = function(e, p) {
                return els[e.type][p].offsetInfo;
            };

            $scope.elementModelData = function(e) {
                return $scope.elementData[e.id];
            };

            $scope.showFields = function(e) {
                return e.enabled !== '0' && e.enabled;
            };

            $scope.updateTotalSamples = function() {
                let numParams = 0;
                for (let e of $scope.rsOptElements.filter((e) => {
                    return $scope.showFields(e);
                })) {
                    for (let p of $scope.rsOptParams) {
                        if (! e[p]) {
                            continue;
                        }
                        numParams += e[shadowService.rsOptElementOffsetField(p)]
                            .split(',')
                            .reduce((c, x) => c + (parseFloat(x) ? 1 : 0), 0);
                    }
                }
                $scope.model.totalSamples = numParams === 0 ? 0 :
                    ($scope.model.scanType === 'random' ? $scope.model.numSamples :
                    Math.pow($scope.model.numSamples, numParams));
                updateFormValid(numParams);
            };

            function updateElements() {
                $scope.rsOptElements = shadowService.updateRSOptElements();
                $scope.elementData = {};
                for (let e of $scope.rsOptElements) {
                    const el = e;
                    $scope.elementData[el.id] = {
                        getData: function() {
                            return el;
                        }
                    };
                }
                updateParams();
            }

            function updateFormValid(numParams) {
                validationService.validateField(
                    'exportRsOpt',
                    'totalSamples',
                    'input',
                    numParams > 0,
                    'select at least one element and vary at least one parameter'
                );
            }

            function updateParams() {
                let s = new Set();
                for (let e in els) {
                    for (let k of Object.keys(els[e])) {
                        s.add(k);
                    }
                }
                $scope.rsOptParams = [...s];
                $scope.rsOptElementFields = [];
                SIREPO.APP_SCHEMA.view.rsOptElement.basic = [];
                let m = SIREPO.APP_SCHEMA.model[$scope.modelName];

                // dynamically change the schema
                for (let p of $scope.rsOptParams) {
                    const fp = shadowService.rsOptElementOffsetField(p);
                    m[fp] = SIREPO.APP_SCHEMA.constants.rsOptDefaultOffsetInfo[p];
                    $scope.rsOptElementFields.push(m[fp][SIREPO.INFO_INDEX_LABEL]);
                    SIREPO.APP_SCHEMA.view.rsOptElement.basic.push(fp);
                }
                $scope.updateTotalSamples();
            }

            function updateElementWatchFields() {
                for (let i = 0; i < $scope.model.elements.length; ++i) {
                    let e = $scope.model.elements[i];
                    for (let p of $scope.rsOptParams) {
                        if (e[p]) {
                            elementFields.push(`exportRsOpt.elements.${i}.${shadowService.rsOptElementOffsetField(p)}`);
                        }
                    }
                }
            }

            function showRandomSeeed() {
                panelState.showField('exportRsOpt', 'randomSeed', $scope.model.scanType === 'random');
            }

            $scope.$on('exportRsOpt.editor.show', () => {
                updateElements();
            });

            updateElements();
            updateElementWatchFields();
            panelState.waitForUI(() => {
                panelState.enableField('exportRsOpt', 'totalSamples', false);
            });
            appState.watchModelFields($scope, exportFields, $scope.updateTotalSamples);
            appState.watchModelFields($scope, elementFields, $scope.updateTotalSamples);
            appState.watchModelFields($scope, ['exportRsOpt.scanType'], showRandomSeeed);
            $scope.$on('beamline.changed', updateElements);
            $scope.$on('exportRsOpt.changed', updateElements);
        },
    };
});


SIREPO.app.directive('reflectivityMaterial', function() {
    return {
        restrict: 'A',
        require: 'ngModel',
        link: function(scope, element, attrs, ngModel) {
            ngModel.$parsers.push(function(value) {
                if (ngModel.$isEmpty(value)) {
                    return null;
                }
                var isValid = true;
                if (! /^[A-Za-z0-9().]+$/.test(value)) {
                    isValid = false;
                }
                else if (/^[a-z0-9]/.test(value)) {
                    isValid = false;
                }
                else if (/[0-9][a-z]/.test(value)) {
                    isValid = false;
                }
                ngModel.$setValidity('', isValid);
                return value;
            });
        }
    };
});
