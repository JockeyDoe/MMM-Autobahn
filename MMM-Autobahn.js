Module.register("MMM-Autobahn", {
    // Default module config.
    defaults: {
        reloadInterval: 1000 * 60 * 15,
        logo_right: false,
        roads: [
            {
                road: "A5",
                from: 10,
                to: 22
            }
        ]
    },

    start: function () {
        Log.info("Starting module: " + this.name);
        this.roadData = [];
        this.loaded = false;
    },

    getStyles: function () {
        return ["autobahn.css"];
    },

    // Override dom generator.
    getDom: function () {
        var wrapper = document.createElement("div");
        wrapper.id = "autobahn";

        if (!this.loaded) {
            wrapper.innerHTML = "Lade ...";
            wrapper.className = "dimmed light small";
            return wrapper;
        }

        if (!this.roadData || this.roadData.length == 0) {
            wrapper.innerHTML = "Keine aktuellen Meldungen";
            wrapper.className = "dimmed light small";
            return wrapper;
        }

        this.roadData.forEach(warning => {
            let div = document.createElement("div");
            div.classList.add("autobahn-report-element");

            let title = document.createElement("div");
            title.classList.add("autobahn-report-title");

            let roadSign = document.createElement("span");
            roadSign.id = 'road-sign';

            roadSign.innerText = warning.road.substring(1);

            let subtitle = document.createElement("span");
            subtitle.classList.add("autobahn-report-subtitle")
            subtitle.innerText = warning.subtitle;

            if (!this.config.logo_right) {
                title.appendChild(roadSign);
                title.appendChild(subtitle);
            } else {
                title.appendChild(subtitle);
                title.appendChild(roadSign);
            }
            div.appendChild(title);


            let body = document.createElement("span");
            for (let i = 0; i < warning.description.length; i++) {
                line = warning.description[i];

                if (line && !line.startsWith("Beginn:") && !line.startsWith("Ende:") && !line.match(/^A\d+/)) {
                    if (line.startsWith("Länge:")) {

                        let length = new Number(line.match(/\d+.?\d*/)[0]);
                        length = Math.round(length);
                        console.log(length);

                        jamLength = document.createElement("div");
                        jamLength.classList.add("jam-length");

                        if (warning.isBlocked === "true") {
                            blocked = document.createElement("span");
                            blocked.classList.add("blocked");
                            blocked.innerText = "VOLLSPERRUNG";
                            jamLength.appendChild(blocked);
                        }

                        let jamImg = document.createElement("img");
                        jamImg.src = "/MMM-Autobahn/jam.png";
                        jamImg.classList.add("jam-icon");
                        jamLength.appendChild(jamImg);

                        jamLength.innerHTML += length + " km";
                        div.appendChild(jamLength);
                    }
                    else body.innerHTML += line + "<br />";
                }
            }
            div.appendChild(body);

            wrapper.appendChild(div);
        });

        return wrapper;
    },

    notificationReceived: function (notification, payload, sender) {
        switch (notification) {
            case "DOM_OBJECTS_CREATED":
                //Update the data, after creating
                this.sendSocketNotification("GET_AUTOBAHN_DATA",
                    {
                        "config": this.config,
                        "identifier": this.identifier
                    }
                )
                //Start timer for update
                var timer = setInterval(() => {
                    this.sendSocketNotification("GET_AUTOBAHN_DATA",
                        {
                            "config": this.config,
                            "identifier": this.identifier
                        }
                    )
                }, this.config.reloadInterval);
                break;
        }
    },

    socketNotificationReceived: function (notification, payload) {
        switch (notification) {
            case "AUTOBAHN_DATA":
                this.roadData = payload;
                this.roadData.lastUpdate = "";
                this.loaded = true;
                console.log("test");
                this.updateDom();
                break;
            case "AUTOBAHN_DATA_ERROR":
                this.data = [];
                //ToDo Error Handling to user
                break;
        }
    }
});