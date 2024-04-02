const NodeHelper = require("node_helper");
var request = require("native-request");

module.exports = NodeHelper.create({
    start: function () { },

    socketNotificationReceived: function (notification, payload) {
        switch (notification) {
            case "GET_AUTOBAHN_DATA":
                let self = this;
                self.getData(payload);
                break;
        }
    },

    getData: async function (payload) {
        let self = this;
        let roads = payload.config.roads;

        let roadData = [];

        for (let i = 0; i < roads.length; i++) {
            roadObject = roads[i];

            let warningUrl = `https://verkehr.autobahn.de/o/autobahn/${roadObject.road}/services/warning`

            let response = JSON.parse(await this.doGetRequest(warningUrl));

            let from = roadObject.from;
            let to = roadObject.to;

            response.warning.forEach(warning => {
                warning.road = roadObject.road;

                if (from && to) {
                    let asNumbers = warning.title.match(/\d+\w*/g);

                    if (asNumbers.length == 0 || asNumbers.some(num => {
                        num = new Number(num.replace(/\D+/g, ''))
                        return num.between(from, to); 
                    })) {
                        roadData.push(warning);
                    }
                } else {
                    roadData.push(warning);
                }
            });
        }

        self.sendSocketNotification("AUTOBAHN_DATA", roadData);
    },

    doGetRequest: async function (url) {
        return new Promise((resolve, reject) => {
            let options = {
                method: 'GET',
                url,
                headers: {}
            }

            request.request(options, (error, response) => {
                if (error)
                    reject(error);
                else
                    resolve(response);
            });
        })
    }
});

Number.prototype.between = function (a, b) {
    var min = Math.min.apply(Math, [a, b]),
        max = Math.max.apply(Math, [a, b]);
    return this >= min && this <= max;
};
