'use strict';

var Promise = require("bluebird");
var request = Promise.promisify(require("request"));
var _ = require("lodash");

/*
 * constructor
 */
function SonarrAPI(options) {

    // gather params
    this.hostname = options.hostname;
    this.apiKey = options.apiKey;
    this.port = options.port || 8989;
    this.urlBase = options.urlBase;
    this.ssl = options.ssl || false;
    this.username = options.username || null;
    this.password = options.password || null;

    // http_auth requested
    this.auth = false;
    if (this.username && this.password) {
        this.auth = true;
    }

    // hostname in valid
    if (!this.hostname) {
        throw new TypeError("Hostname is empty");
    }

    // sanitize hostname
    this.hostname = this.hostname.replace(/^https?:\/\//, '');
    if (this.hostname.search(/[^\w.-_]+/g) !== -1) {
        throw new TypeError("Hostname is not valid");
    }

    // port is valid
    if ((!this.port) || (typeof this.port != 'number')) {
        throw new TypeError("Port is not a number");
    }

    // api key is valid length
    if (this.apiKey.length != 32) {
        throw new TypeError("API Key is an invalid length");
    }

    // api key has valid characters
    if (this.apiKey.search(/[^a-z0-9]+/g) !== -1) {
        throw new TypeError("API Key has invalid characters");
    }

    // url base is valid
    if ((this.urlBase) && (this.urlBase.charAt(0) != '/')) {
        this.urlBase = '/' + this.urlBase;
    }

    // build the url
    var serverUrl = (this.ssl !== false ? 'https://' : 'http://') + this.hostname + ':' + this.port;

    // add in the url base
    if (this.urlBase) {
        serverUrl = serverUrl + this.urlBase;
    }

    // complete api url
    this.serverApi = serverUrl + '/api/';
}

/*
 * sends request to Sonarr API
 */
SonarrAPI.prototype._request = function _request(actions) {

    // append the Server url, api, and relative url and - if GET params those too
    var apiUrl = this.serverApi + actions.relativeUrl;
    if ((actions.parameters) && (actions.method == 'GET')) {
        apiUrl = apiUrl + jsonToQueryString(actions.parameters);
    }

    //console.log(apiUrl);

    // Build the http request headers
    var headers = {
        "X-API-KEY": this.apiKey,
    }

    // append the type
    if (actions.method == 'GET') {
        _.extend(headers, {
            "Accept": "application/json"
        });
    } else {
        _.extend(headers, {
            "Content-Type": "application/json"
        });
    }

    // append auth to headers
    if (this.auth) {
        _.extend(headers, {
            "Authorization": 'Basic ' + new Buffer(this.username + ':' + this.password).toString('base64')
        });
    }

    //console.log(headers);

    // request options
    var options = {
        "url": apiUrl,
        "headers": headers
    }

    // ususally we don't have valid ssl certs, so ignore it
    if (this.ssl) {
        _.extend(options, {
            "strictSSL": false
        });
    }

    // append the method parameter to the request
    _.extend(options, {
        "method": actions.method
    });

    if (_.contains(["POST", "PUT", "DELETE"], actions.method)) {
        _.extend(options, {
            "json": actions.parameters
        });
    } else {
        _.extend(options, {
            "json": true
        });
    }

    // console.log(options);

    // send request return a promise
    return request(options).then(function(response) {

        // console.log(response[0].headers['content-type']);

        // api key is invalid
        if ((response[0].body.error) && (response[0].body.error == 'Unauthorized')) {
            return Promise.reject(JSON.stringify(response[0].body));
        }

        // response is not json
        if (response[0].headers['content-type'] !== 'application/json; charset=utf-8') {
            return Promise.reject(JSON.stringify({
                "error": "JSON expected"
            }));
        }

        // finally we have the json data
        return Promise.resolve(response[0].body);

    }).catch(ResponseError, function(e) {
        return Promise.reject(JSON.stringify(response[0].body));
    });
};

/*
 * Retrieve from API via GET
 * https://github.com/Sonarr/Sonarr/wiki/API
 */
SonarrAPI.prototype.get = function(relativeUrl, parameters) {

    // no Relative url was passed
    if (relativeUrl === undefined) {
        throw new TypeError('Relative URL is not set');
    }

    // parameters isn't an object
    if ((parameters) && (typeof parameters !== 'object')) {
        throw new TypeError('Parameters must be type object');
    }

    var actions = {
        "relativeUrl": relativeUrl,
        "method": "GET",
        "parameters": parameters
    }

    return this._request(actions).then(function(data) {
        return data;
    });
};

/*
 * Perform an action via POST
 */
SonarrAPI.prototype.post = function(relativeUrl, parameters) {

    // no Relative url was passed
    if (relativeUrl === undefined) {
        throw new TypeError('Relative URL is not set');
    }

    // parameters isn't an object
    if ((parameters) && (typeof parameters !== 'object')) {
        throw new TypeError('Parameters must be type object');
    }

    var actions = {
        "relativeUrl": relativeUrl,
        "method": "POST",
        "parameters": parameters
    }

    return this._request(actions).then(function(data) {
        return data;
    });
};

/*
 * Perform an action via PUT
 */
SonarrAPI.prototype.put = function(relativeUrl, parameters) {

    // no Relative url was passed
    if (relativeUrl === undefined) {
        throw new TypeError('Relative URL is not set');
    }

    // parameters isn't an object
    if ((parameters) && (typeof parameters !== 'object')) {
        throw new TypeError('Parameters must be type object');
    }

    var actions = {
        "relativeUrl": relativeUrl,
        "method": "PUT",
        "parameters": parameters
    }

    return this._request(actions).then(function(data) {
        return data;
    });
};

/*
 * Perform an action via PUT
 */
SonarrAPI.prototype.delete = function(relativeUrl, parameters) {

    // no Relative url was passed
    if (relativeUrl === undefined) {
        throw new TypeError('Relative URL is not set');
    }

    // parameters isn't an object
    if ((parameters) && (typeof parameters !== 'object')) {
        throw new TypeError('Parameters must be type object');
    }

    var actions = {
        "relativeUrl": relativeUrl,
        "method": "DELETE",
        "parameters": parameters
    }

    return this._request(actions).then(function(data) {
        return data;
    });
};

/*
 * Function to turn json object to URL params
 */
function jsonToQueryString(json) {
    return '?' +
        Object.keys(json).map(function(key) {
            if (json[key] != null) {
                return encodeURIComponent(key) + '=' +
                    encodeURIComponent(json[key]);
            }
        }).join('&');
}

/*
 * Standard errors
 */
function ResponseError(e) {
    return e.code >= 400;
}

module.exports = SonarrAPI;
