var request = require('request');
var multer = require('multer');
var fs = require('fs');
const config = require('config');
const ai_url = config.get('ai_URL');
const neuralZomeUserModel = require(MODELS + 'neuralZomeUser');
var user_details;
var NeuralZoneData = {};

const storage = multer.diskStorage({
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + '.' + file.originalname.split('.').pop());
    }
});
const upload = multer({ storage: storage }).single('file');

exports.getDetailsForStep2 = function (req, res, next) {
    try {
        var file_details;
        upload(req, res, function (err) {
            if (err) {
                return err;
            }
            if ((res.req.file) && (res.req.body.email)) {
                neuralZomeUserModel.find({ 'email': res.req.body.email }, function (err, body) {
                    if (err) {
                        console.log(err);
                    } else {
                        NeuralZoneData.file_details = res.req.file;
                        NeuralZoneData.user_details = res.req.body;
                        if (body.length > 0) {
                            if ((body[0].premium == 'Free') && (body[0].total_model_count < config.get('free_version.total_model_count')) && (body[0].total_api_hit_count < config.get('free_version.total_api_hit_count'))) {
                                sendDataToAI(NeuralZoneData, 1, body[0], res, next);
                            } else if ((body[0].premium == 'Gold') && (body[0].total_model_count < config.get('gold_version.total_model_count')) && (body[0].total_api_hit_count < config.get('gold_version.total_api_hit_count'))) {
                                sendDataToAI(NeuralZoneData, 1, body[0], res, next);
                            } else if ((body[0].premium == 'Platinum')) {
                                sendDataToAI(NeuralZoneData, 1, body[0], res, next);
                            } else {
                                next('Buy premium');
                            }
                        } else {
                            sendDataToAI(NeuralZoneData, 0, {}, res, next);
                        }
                    }
                });
            } else {
                next('File and Email is required');
            }
        })
    } catch (ex) {
        return ex;
    }
}

exports.getDetailsForPredict = function (req, res, next) {
    try {
        var modelId = req.body.modelId;
        neuralZomeUserModel.find({ email: req.body.email, "model.model_id": req.body.modelId }, (err, record) => {
            if (err) {
                console.log(err);
            } else {
                if (record.length > 0) {
                    var data;
                    var result = record[0].model.find(function (item) {
                        if (item.model_id == modelId) {
                            return item;
                        }
                    });
                    if ((result.steps == 2) || result.steps == 3) {
                        data = { 'email': record[0].email, 'model_details': result };
                        if ((record[0].premium == 'Free') && (record[0].total_model_count < config.get('free_version.total_model_count')) && (record[0].total_api_hit_count < config.get('free_version.total_api_hit_count'))) {
                            data.info = false;
                            return res.sendResponse({
                                data
                            }, "User data fetched successfully");
                        } else if ((record[0].premium == 'Gold') && (record[0].total_model_count < config.get('gold_version.total_model_count')) && (record[0].total_api_hit_count < config.get('gold_version.total_api_hit_count'))) {
                            data.info = false;
                            return res.sendResponse({
                                data
                            }, "User data fetched successfully");
                        } else if ((record[0].premium == 'Platinum')) {
                            data.info = false;
                            return res.sendResponse({
                                data
                            }, "User data fetched successfully");
                        } else {
                            next('Buy premium');
                        }
                    } else {
                        next('Please complete step 2');
                    }
                } else {
                    next('Invalid data');
                }
            }
        });

    } catch (ex) {
        return ex;
    }
}

function sendDataToAI(NeuralZoneData, num, data, res, next) {
    let formData = {
        file: {
            value: fs.createReadStream(NeuralZoneData.file_details.path),
            options: {
                filename: NeuralZoneData.file_details.filename,
                contentType: NeuralZoneData.file_details.mimetype
            }
        },
        email: NeuralZoneData.user_details.email
    };
    request.post({
        url: ai_url + 'uploader',
        headers: {
            'Content-Type': 'multipart/form-data'
        },
        formData: formData
    }, function (error, body) {
        if (error) {
            next(error);
        } else {
            if ((typeof (body.body) == "string") && JSON.parse(body.body).status == 'true') {
                var result = JSON.parse(body.body);
                var obj;
                if (result.status == 'true') {
                    if (num == 0) {
                        obj = {
                            email: result.email,
                            model: [{
                                model_id: result.modelId,
                                algo_hyper: result.algo,
                                prob_type: result.prob_type,
                                data_types: JSON.stringify(result.datatypes),
                                filepath: result.filePath,
                                steps: parseInt(NeuralZoneData.user_details.steps),
                                file_extension: result.fileExtension,
                                created_at: new Date()
                            }]
                        };
                        new neuralZomeUserModel(obj).save(function (err, data) {
                            if (err) {
                                console.log(err);
                            } else {
                                result.info = false;
                                var finalResult = {};
                                finalResult.datatypes = result.datatypes;
                                finalResult.email = result.email;
                                finalResult.fileExtension = result.fileExtension;
                                finalResult.filePath = result.filePath;
                                finalResult.modelId = result.modelId;
                                finalResult.prob_type = result.prob_type;
                                res.sendResponse(finalResult, 'User created successfully.');
                            }
                        });
                    } else {
                        data.model.push({
                            model_id: result.modelId,
                            algo_hyper: result.algo,
                            prob_type: result.prob_type,
                            data_types: JSON.stringify(result.datatypes),
                            filepath: result.filePath,
                            steps: parseInt(NeuralZoneData.user_details.steps),
                            file_extension: result.fileExtension,
                            created_at: new Date()
                        })
                        obj = {
                            model: data.model

                        };
                        neuralZomeUserModel.findOneAndUpdate({
                            email: result.email
                        }, {
                                'model': data.model

                            }, { multi: true }, function (err, record) {
                                if (err) {
                                    next('Network Error');
                                } else {
                                    result.info = false;
                                    var finalResult = {};
                                    finalResult.datatypes = result.datatypes;
                                    finalResult.email = result.email;
                                    finalResult.fileExtension = result.fileExtension;
                                    finalResult.filePath = result.filePath;
                                    finalResult.modelId = result.modelId;
                                    finalResult.prob_type = result.prob_type;
                                    res.sendResponse(finalResult, 'User updated successfully.');
                                }
                            });
                    }
                }
            } else {
                next(JSON.parse(body.body));
            }
        }
    });
}

exports.getAccuracyDetails = function (req, res, next) {
    try {
        var bodyDetails = req.body;
        request.post({
            url: ai_url + 'algo_select',
            headers: {
                'Content-Type': 'application/json'
            },
            json: bodyDetails
        }, function (error, body) {
            if (error) {
                next(error);
            } else {
                var result = body.body;
                res.sendResponse(result, 'fetching algo details successfully.');
            }
        });
    } catch (ex) {
        return ex;
    }
}

exports.getHyperAlgoDetails = function (req, res, next) {
    try {
        neuralZomeUserModel.find({ email: req.body.email },
            { model: { $elemMatch: { model_id: req.body.model_id } } }, (err, record) => {
                if (err) {
                    next(err)
                } else {
                    if (record.length > 0) {
                        var finalResult = {};
                        finalResult.email = req.body.email;
                        finalResult.model = record[0].model;
                        res.sendResponse(finalResult, 'fetching algo details successfully.');
                    } else {
                        next('Invalid data');
                    }
                }
            });
    } catch (ex) {
        return ex;
    }
}
