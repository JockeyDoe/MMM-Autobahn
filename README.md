# MMM-Autobahn

MMM-Autobahn is a MagicMirror² module for displaying current traffic warnings from the German Autobahn network.

This repository is based on the original project by [JockeyDoe](https://github.com/JockeyDoe/MMM-Autobahn). The current enhancements adapt the module to changes in the Autobahn API and add route-based filtering, scheduled update intervals, and a more compact display.

> The module uses the official Autobahn traffic API at `https://verkehr.autobahn.de/o/autobahn/`.

## Features

- Display current traffic warnings for selected Autobahn roads
- Filter warnings by a configurable route corridor
- Use the API's GeoJSON `LineString` geometry where available
- Fall back to a warning's single coordinate if no geometry is available
- Keep legacy `from` / `to` filtering for backwards compatibility
- Configure time-based reload intervals
- Limit long warning descriptions to avoid overlapping neighbouring MagicMirror modules
- Distinguish between "no current warnings" and an API request failure

## Preview

![Example](screenshot2.jpg)

## Installation

Go to the MagicMirror modules directory:

```shell
cd ~/MagicMirror/modules/
```

Clone the repository and install the dependencies:

```shell
git clone https://github.com/JockeyDoe/MMM-Autobahn.git
cd MMM-Autobahn
npm install
```

Then add the module to your MagicMirror `config/config.js`.

## Basic configuration

```javascript
{
    module: "MMM-Autobahn",
    header: "Verkehrsmeldungen",
    position: "top_right",

    config: {
        reloadInterval: 1000 * 60 * 30,
        logo_right: false,
        maxDescriptionLines: 3,

        roads: [
            {
                road: "A7"
            },
            {
                road: "A26"
            }
        ]
    }
}
```

## Configuration options

| Option | Default | Description |
|---|---:|---|
| `reloadInterval` | `1000 * 60 * 30` | Normal reload interval in milliseconds. |
| `reloadSchedule` | `[]` | Optional list of time windows with alternative reload intervals. |
| `logo_right` | `false` | Display the Autobahn sign on the right side of the warning title. |
| `maxDescriptionLines` | `3` | Maximum number of normal description lines shown per warning. |
| `roads` | `[]` | Autobahn road definitions to fetch and display. |
| `road` | — | Autobahn name, for example `"A7"`. |
| `route` | — | Optional array of route points containing `lat` and `long`. |
| `corridorKm` | `4` | Maximum distance in kilometres between a warning and the configured route. |
| `from` | — | Legacy junction-number filter. Kept for backwards compatibility. |
| `to` | — | Legacy junction-number filter. Kept for backwards compatibility. |

## Route-based filtering

The current Autobahn API no longer reliably includes junction numbers in warning titles. A warning may now have a title such as:

```text
A7 | Verkehrsmeldung
```

This makes the old `from` / `to` filter unreliable for many roads.

MMM-Autobahn therefore supports filtering against a route polyline. The route consists of two or more latitude/longitude points. A warning is displayed when at least one point of its API geometry lies within the configured corridor.

Example for a section of the A7:

```javascript
roads: [
    {
        road: "A7",
        corridorKm: 4,

        route: [
            { lat: 53.5220, long: 9.9260 },
            { lat: 53.4700, long: 9.9500 },
            { lat: 53.4094, long: 9.9931 },
            { lat: 53.3837, long: 10.0184 },
            { lat: 53.3464, long: 10.0383 }
        ]
    }
]
```

Additional route points can be used to follow curves, motorway rings, or other non-linear road sections. This avoids the limitations of a simple rectangular geographic filter.

### Coordinate format

The Autobahn API returns route geometry as GeoJSON. GeoJSON coordinates use this order:

```text
[longitude, latitude]
```

The module converts them internally to:

```javascript
{
    lat: 53.5220,
    long: 9.9260
}
```

If a warning does not contain a `LineString` geometry, the module falls back to `warning.coordinate`.

## Legacy `from` / `to` filtering

Existing configurations using junction-number filters remain supported:

```javascript
roads: [
    {
        road: "A5",
        from: 10,
        to: 22
    }
]
```

However, the current API does not reliably provide junction numbers in warning titles. For new configurations, `route` together with `corridorKm` is recommended.

If neither a route nor a legacy range is configured, all current warnings for the selected road are displayed.

## Time-based reload intervals

`reloadInterval` defines the normal update interval. Optional time windows can override it.

Example: update every 5 minutes between 05:00 and 07:00, otherwise every 30 minutes:

```javascript
reloadInterval: 1000 * 60 * 30,

reloadSchedule: [
    {
        start: "05:00",
        end: "07:00",
        reloadInterval: 1000 * 60 * 5
    }
]
```

The scheduler also observes the start and end of each time window. For example, if a normal 30-minute cycle would run from 04:50 to 05:20, the module wakes at 05:00 and switches to the 5-minute interval instead of waiting until 05:20.

Multiple schedule entries are supported. Time windows crossing midnight are supported as well:

```javascript
reloadSchedule: [
    {
        start: "22:00",
        end: "02:00",
        reloadInterval: 1000 * 60 * 10
    }
]
```

Each schedule entry uses local system time.

## Compact warning display

Some warnings returned by the current API contain long descriptions. `maxDescriptionLines` limits the amount of normal description text shown for each warning:

```javascript
maxDescriptionLines: 3
```

Traffic-jam length and full road-closure information are displayed separately and are not counted as normal description lines.

The module CSS also limits the module width and hides overflow to reduce the risk of traffic warnings overlapping neighbouring MagicMirror modules.

## API request handling

Traffic data is fetched from:

```text
https://verkehr.autobahn.de/o/autobahn/{ROAD}/services/warning
```

Requests use a 60-second timeout because the Autobahn API can occasionally respond slowly.

The display differentiates between these states:

- `Lade ...` — initial request still running
- `Keine aktuellen Meldungen` — request succeeded, but no warning matched the configured roads or route filters
- `Datenabruf fehlgeschlagen` — traffic data could not be retrieved

## Example: route filter plus scheduled updates

```javascript
{
    module: "MMM-Autobahn",
    header: "Verkehrsmeldungen",
    position: "top_right",

    config: {
        reloadInterval: 1000 * 60 * 30,

        reloadSchedule: [
            {
                start: "05:00",
                end: "07:00",
                reloadInterval: 1000 * 60 * 5
            }
        ],

        logo_right: true,
        maxDescriptionLines: 3,

        roads: [
            {
                road: "A7",
                corridorKm: 4,
                route: [
                    { lat: 53.5220, long: 9.9260 },
                    { lat: 53.4700, long: 9.9500 },
                    { lat: 53.4094, long: 9.9931 },
                    { lat: 53.3837, long: 10.0184 },
                    { lat: 53.3464, long: 10.0383 }
                ]
            },
            {
                road: "A26"
            }
        ]
    }
}
```

## Notes for contributors

The route-corridor implementation was added in response to changes in the Autobahn API that removed reliable junction-number information from warning titles. It is intended to preserve existing configurations while providing a geometry-based alternative for current API data.

When changing filtering logic, please keep these cases in mind:

- long Autobahns with many unrelated warnings
- curved motorway sections and city rings
- warnings with `LineString` geometry
- warnings with only a single coordinate
- API responses without usable junction numbers
- temporary API delays or request timeouts

## Credits

Original module: [JockeyDoe/MMM-Autobahn](https://github.com/JockeyDoe/MMM-Autobahn)

Traffic data: German Autobahn traffic API at `verkehr.autobahn.de`.
