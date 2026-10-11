const NodeHelper = require("node_helper");

module.exports = NodeHelper.create({

    start: function () {
    },

    socketNotificationReceived: function (notification, payload) {
        if (notification === "GET_AUTOBAHN_DATA") {
            this.getData(payload);
        }
    },

    getData: async function (payload) {
        const roads = payload?.config?.roads || [];
        const roadData = [];
        const seen = new Set();

        let successfulRequests = 0;

        for (const roadObject of roads) {
            try {
                const warningUrl =
                    `https://verkehr.autobahn.de/o/autobahn/${roadObject.road}/services/warning`;

                const response = await fetch(warningUrl, {
                    signal: AbortSignal.timeout(60000)
                });

                if (!response.ok) {
                    throw new Error(
                        `HTTP ${response.status} for ${roadObject.road}`
                    );
                }

                const data = await response.json();

                if (!data || !Array.isArray(data.warning)) {
                    throw new Error(
                        `Invalid API response for ${roadObject.road}`
                    );
                }

                successfulRequests++;

                for (const warning of data.warning) {
                    warning.road = roadObject.road;

                    if (!this.warningMatchesFilter(warning, roadObject)) {
                        continue;
                    }

                    const id =
                        warning.identifier ||
                        `${warning.road}-${warning.title}-${warning.startTimestamp}`;

                    if (seen.has(id)) {
                        continue;
                    }

                    seen.add(id);
                    roadData.push(warning);
                }

            } catch (error) {
                console.error(
                    `[MMM-Autobahn] Failed to fetch ${roadObject.road}:`,
                    error.message
                );
            }
        }

        if (roads.length > 0 && successfulRequests === 0) {
            this.sendSocketNotification(
                "AUTOBAHN_DATA_ERROR",
                {
                    message: "Could not retrieve traffic data."
                }
            );

            return;
        }

        this.sendSocketNotification(
            "AUTOBAHN_DATA",
            roadData
        );
    },

    warningMatchesFilter: function (warning, roadObject) {

        /*
         * Preferred filter:
         * route polyline + configurable corridor.
         */
        if (
            Array.isArray(roadObject.route) &&
            roadObject.route.length >= 2
        ) {
            return this.warningMatchesRoute(
                warning,
                roadObject
            );
        }

        /*
         * Backwards-compatible legacy filter.
         */
        const from = Number(roadObject.from);
        const to = Number(roadObject.to);

        if (
            Number.isFinite(from) &&
            Number.isFinite(to)
        ) {
            return this.warningMatchesLegacyRange(
                warning,
                from,
                to
            );
        }

        /*
         * No filter:
         * display all warnings for this road.
         */
        return true;
    },

    warningMatchesLegacyRange: function (warning, from, to) {

        /*
         * Remove the Autobahn number itself before looking
         * for possible junction numbers.
         */
        const title = String(warning?.title || "")
            .replace(/^\s*A\d+\s*\|\s*/i, "");

        const matches = title.match(/\d+/g) || [];

        /*
         * Current API titles frequently contain no junction
         * numbers at all. In that case there is no reliable
         * legacy value to filter by.
         */
        if (matches.length === 0) {
            return true;
        }

        const min = Math.min(from, to);
        const max = Math.max(from, to);

        return matches.some(value => {
            const number = Number(value);

            return (
                Number.isFinite(number) &&
                number >= min &&
                number <= max
            );
        });
    },

    warningMatchesRoute: function (warning, roadObject) {
        const route = roadObject.route;

        const corridorKm =
            Number.isFinite(Number(roadObject.corridorKm))
                ? Number(roadObject.corridorKm)
                : 4;

        const warningPoints =
            this.getWarningPoints(warning);

        if (warningPoints.length === 0) {
            return false;
        }

        for (const warningPoint of warningPoints) {

            for (let i = 0; i < route.length - 1; i++) {

                const distance =
                    this.distancePointToSegmentKm(
                        warningPoint,
                        route[i],
                        route[i + 1]
                    );

                if (distance <= corridorKm) {
                    return true;
                }
            }
        }

        return false;
    },

    getWarningPoints: function (warning) {

        /*
         * GeoJSON LineString:
         * [longitude, latitude]
         */
        if (
            warning?.geometry?.type === "LineString" &&
            Array.isArray(warning.geometry.coordinates)
        ) {
            return warning.geometry.coordinates
                .filter(point =>
                    Array.isArray(point) &&
                    point.length >= 2 &&
                    Number.isFinite(Number(point[0])) &&
                    Number.isFinite(Number(point[1]))
                )
                .map(point => ({
                    lat: Number(point[1]),
                    long: Number(point[0])
                }));
        }

        /*
         * Fallback if no LineString geometry is available.
         */
        if (
            warning?.coordinate &&
            Number.isFinite(Number(warning.coordinate.lat)) &&
            Number.isFinite(Number(warning.coordinate.long))
        ) {
            return [{
                lat: Number(warning.coordinate.lat),
                long: Number(warning.coordinate.long)
            }];
        }

        return [];
    },

    distancePointToSegmentKm: function (point, start, end) {
        const earthRadiusKm = 6371;

        const latRef =
            (
                Number(point.lat) +
                Number(start.lat) +
                Number(end.lat)
            ) / 3;

        const latRefRad =
            this.toRadians(latRef);

        /*
         * Local equirectangular projection.
         */
        const project = p => ({
            x:
                earthRadiusKm *
                this.toRadians(Number(p.long)) *
                Math.cos(latRefRad),

            y:
                earthRadiusKm *
                this.toRadians(Number(p.lat))
        });

        const p = project(point);
        const a = project(start);
        const b = project(end);

        const abX = b.x - a.x;
        const abY = b.y - a.y;

        const apX = p.x - a.x;
        const apY = p.y - a.y;

        const abLengthSquared =
            abX * abX +
            abY * abY;

        if (abLengthSquared === 0) {
            return Math.hypot(
                p.x - a.x,
                p.y - a.y
            );
        }

        let t =
            (
                apX * abX +
                apY * abY
            ) /
            abLengthSquared;

        t = Math.max(0, Math.min(1, t));

        const nearestX =
            a.x +
            t * abX;

        const nearestY =
            a.y +
            t * abY;

        return Math.hypot(
            p.x - nearestX,
            p.y - nearestY
        );
    },

    toRadians: function (value) {
        return value * Math.PI / 180;
    }

});
