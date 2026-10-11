Module.register("MMM-Autobahn", {

    defaults: {
        /*
         * Normal reload interval.
         */
        reloadInterval: 1000 * 60 * 30,

        /*
         * Optional time-based reload intervals.
         *
         * Example:
         * 05:00 - 07:00 every 5 minutes,
         * otherwise reloadInterval is used.
         */
        reloadSchedule: [],

        logo_right: false,

        /*
         * Limit long API descriptions so the module
         * does not overlap neighbouring modules.
         */
        maxDescriptionLines: 3,

        roads: []
    },

    start: function () {
        Log.info("Starting module: " + this.name);

        this.roadData = [];
        this.loaded = false;
        this.error = false;
        this.reloadTimer = null;
    },

    getStyles: function () {
        return ["autobahn.css"];
    },

    getDom: function () {
        const wrapper = document.createElement("div");
        wrapper.id = "autobahn";

        if (!this.loaded) {
            wrapper.innerHTML = "Lade ...";
            wrapper.className = "dimmed light small";
            return wrapper;
        }

        if (this.error) {
            wrapper.innerHTML = "Datenabruf fehlgeschlagen";
            wrapper.className = "dimmed light small";
            return wrapper;
        }

        if (!this.roadData || this.roadData.length === 0) {
            wrapper.innerHTML = "Keine aktuellen Meldungen";
            wrapper.className = "dimmed light small";
            return wrapper;
        }

        this.roadData.forEach(warning => {

            const div = document.createElement("div");
            div.classList.add("autobahn-report-element");

            /*
             * Header
             */
            const title = document.createElement("div");
            title.classList.add("autobahn-report-title");

            const roadSign = document.createElement("span");
            roadSign.classList.add("road-sign");

            roadSign.innerText =
                warning.road?.startsWith("A")
                    ? warning.road.substring(1)
                    : warning.road || "";

            const subtitle = document.createElement("span");
            subtitle.classList.add("autobahn-report-subtitle");

            subtitle.innerText =
                warning.subtitle ||
                warning.title ||
                "";

            if (!this.config.logo_right) {
                title.appendChild(roadSign);
                title.appendChild(subtitle);
            } else {
                title.appendChild(subtitle);
                title.appendChild(roadSign);
            }

            div.appendChild(title);

            /*
             * Full road closure
             */
            if (
                warning.isBlocked === "true" ||
                warning.isBlocked === true
            ) {
                const blocked =
                    document.createElement("div");

                blocked.classList.add("blocked");
                blocked.innerText = "VOLLSPERRUNG";

                div.appendChild(blocked);
            }

            /*
             * Warning description
             */
            const body = document.createElement("div");
            body.classList.add("autobahn-report-body");

            let shownLines = 0;

            const description =
                Array.isArray(warning.description)
                    ? warning.description
                    : [];

            for (const rawLine of description) {

                if (!rawLine) {
                    continue;
                }

                const line =
                    String(rawLine).trim();

                if (!line) {
                    continue;
                }

                /*
                 * Hide redundant technical information.
                 */
                if (
                    line.startsWith("Beginn:") ||
                    line.startsWith("Ende:") ||
                    /^A\d+\s*$/.test(line)
                ) {
                    continue;
                }

                /*
                 * Display traffic jam length separately.
                 */
                if (line.startsWith("Länge:")) {

                    const lengthMatch =
                        line.match(/\d+(?:[.,]\d+)?/);

                    if (lengthMatch) {

                        const jamLength =
                            document.createElement("div");

                        jamLength.classList.add(
                            "jam-length"
                        );

                        const jamImg =
                            document.createElement("img");

                        jamImg.src =
                            "/MMM-Autobahn/jam.png";

                        jamImg.classList.add(
                            "jam-icon"
                        );

                        jamLength.appendChild(jamImg);

                        const km =
                            Number(
                                lengthMatch[0]
                                    .replace(",", ".")
                            );

                        jamLength.appendChild(
                            document.createTextNode(
                                ` ${Math.round(km)} km`
                            )
                        );

                        div.appendChild(jamLength);
                    }

                    continue;
                }

                if (
                    shownLines >=
                    this.config.maxDescriptionLines
                ) {
                    break;
                }

                const lineDiv =
                    document.createElement("div");

                lineDiv.classList.add(
                    "autobahn-description-line"
                );

                lineDiv.innerText = line;

                body.appendChild(lineDiv);

                shownLines++;
            }

            if (shownLines > 0) {
                div.appendChild(body);
            }

            wrapper.appendChild(div);
        });

        return wrapper;
    },

    notificationReceived: function (notification) {

        if (notification !== "DOM_OBJECTS_CREATED") {
            return;
        }

        /*
         * Initial request immediately after startup.
         */
        this.requestData();

        /*
         * Then use the dynamic scheduler.
         */
        this.scheduleNextUpdate();
    },

    requestData: function () {

        this.sendSocketNotification(
            "GET_AUTOBAHN_DATA",
            {
                config: this.config,
                identifier: this.identifier
            }
        );
    },

    scheduleNextUpdate: function () {

        if (this.reloadTimer) {
            clearTimeout(this.reloadTimer);
        }

        const now = new Date();

        const interval =
            this.getCurrentReloadInterval(now);

        /*
         * Do not sleep beyond a schedule boundary.
         *
         * Example:
         * At 04:55 with a normal 30 minute interval,
         * wake up at 05:00 instead of 05:25.
         */
        const boundaryDelay =
            this.getMillisecondsUntilNextScheduleBoundary(
                now
            );

        let delay = interval;

        if (
            Number.isFinite(boundaryDelay) &&
            boundaryDelay > 0
        ) {
            delay =
                Math.min(
                    interval,
                    boundaryDelay
                );
        }

        this.reloadTimer =
            setTimeout(
                () => {
                    this.requestData();
                    this.scheduleNextUpdate();
                },
                delay
            );
    },

    getCurrentReloadInterval: function (now) {

        const schedule =
            Array.isArray(this.config.reloadSchedule)
                ? this.config.reloadSchedule
                : [];

        const currentMinutes =
            now.getHours() * 60 +
            now.getMinutes();

        for (const entry of schedule) {

            const start =
                this.timeToMinutes(entry.start);

            const end =
                this.timeToMinutes(entry.end);

            const interval =
                Number(entry.reloadInterval);

            if (
                start === null ||
                end === null ||
                !Number.isFinite(interval) ||
                interval <= 0
            ) {
                continue;
            }

            /*
             * Normal interval, e.g. 05:00 - 07:00.
             */
            if (start < end) {

                if (
                    currentMinutes >= start &&
                    currentMinutes < end
                ) {
                    return interval;
                }
            }

            /*
             * Interval crossing midnight,
             * e.g. 22:00 - 02:00.
             */
            else if (start > end) {

                if (
                    currentMinutes >= start ||
                    currentMinutes < end
                ) {
                    return interval;
                }
            }

            /*
             * start === end means 24 hours.
             */
            else {
                return interval;
            }
        }

        return this.config.reloadInterval;
    },

    getMillisecondsUntilNextScheduleBoundary: function (now) {

        const schedule =
            Array.isArray(this.config.reloadSchedule)
                ? this.config.reloadSchedule
                : [];

        if (schedule.length === 0) {
            return Infinity;
        }

        let shortestDelay = Infinity;

        for (const entry of schedule) {

            for (const time of [entry.start, entry.end]) {

                const minutes =
                    this.timeToMinutes(time);

                if (minutes === null) {
                    continue;
                }

                const target =
                    new Date(now);

                target.setHours(
                    Math.floor(minutes / 60),
                    minutes % 60,
                    0,
                    0
                );

                /*
                 * Boundary already passed today:
                 * use tomorrow.
                 */
                if (target <= now) {
                    target.setDate(
                        target.getDate() + 1
                    );
                }

                const delay =
                    target.getTime() -
                    now.getTime();

                shortestDelay =
                    Math.min(
                        shortestDelay,
                        delay
                    );
            }
        }

        return shortestDelay;
    },

    timeToMinutes: function (value) {

        if (
            typeof value !== "string" ||
            !/^\d{2}:\d{2}$/.test(value)
        ) {
            return null;
        }

        const parts =
            value.split(":");

        const hours =
            Number(parts[0]);

        const minutes =
            Number(parts[1]);

        if (
            !Number.isInteger(hours) ||
            !Number.isInteger(minutes) ||
            hours < 0 ||
            hours > 23 ||
            minutes < 0 ||
            minutes > 59
        ) {
            return null;
        }

        return hours * 60 + minutes;
    },

    socketNotificationReceived: function (
        notification,
        payload
    ) {

        if (notification === "AUTOBAHN_DATA") {

            this.roadData =
                Array.isArray(payload)
                    ? payload
                    : [];

            this.loaded = true;
            this.error = false;

            this.updateDom();
        }

        if (notification === "AUTOBAHN_DATA_ERROR") {

            this.roadData = [];
            this.loaded = true;
            this.error = true;

            this.updateDom();
        }
    }

});
