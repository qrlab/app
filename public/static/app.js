const quartariataPosition = [59.8853, 29.8975]
const appMap = L.map('mapid').setView(quartariataPosition, 16)

L.tileLayer('https://api.mapbox.com/styles/v1/mapbox/dark-v9/tiles/256/{z}/{x}/{y}?access_token=pk.eyJ1IjoidG1zaHYiLCJhIjoiM3BMLVc2MCJ9.PM9ukwAm-YUGlrBqt4V6vw', {
    attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="http://mapbox.com">Mapbox</a>',
    maxZoom: 18
}).addTo(appMap)

function main(initialData) {
    const parser = {
        'gpx': compose(addGeoJsonTrack, toGeoJSON.gpx, xmlDom),
        'geojson': addGeoJson,
        'checkins.geojson': addCheckins,
        'images.geojson': addImages,
        'flows.json': addFlow,
    }

    const files = initialData.files
        ? initialData.files
        : []

    const checkins = files.filter(file => endsWith('checkins.geojson', file.name))
    const tracks = files.filter(file => endsWith('gpx', file.name))
    const images = files.filter(file => endsWith('images.geojson', file.name))
    const flows = files.filter(file => endsWith('flows.json', file.name))

    tracks
        .map(f => f.data)
        .map(parser['gpx'])

    checkins
        .map(f => f.data)
        .map(toJson)
        .map(parser['checkins.geojson'])

    images
        .map(f => f.data)
        .map(parser['images.geojson'])

    flows
        .map(f => f.data)
        .map(toJson)
        .map(parser['flows.json'])

    L.marker(quartariataPosition).addTo(appMap)
}

function addGeoJson(geojson) {
    const layer = L.geoJSON(geojson)
    layer.addTo(appMap)
    return layer
}

function addImages(geojson) {
    const features = getFeatures(geojson)
    return features
        .map(feature => {
            const geom = feature.geometry
            const props = feature.properties
            const coord = geom.coordinates.reverse()

            const myIcon = L.divIcon({
                html: `<div class="marker-image"><img src="${props.fileUrl}"/></div>`,
            })

            // you can set .my-div-icon styles in CSS
            L.marker(coord, {icon: myIcon}).addTo(appMap)

            // const icon = new L.ExpressiveIcon({
            //     html : `<div class="marker-image">${props.name}</div>`,
            //     iconAnchor: [0, 0],
            // })
            //
            // const marker = new L.Marker(coord, {icon: icon})
            // marker.addTo(appMap)
            //
            // const marker2 = new L.Marker(coord)
            // appMap.addLayer(marker2)
        })
}

function addCheckins(geojson) {
    const features = getFeatures(geojson, feature => feature.geometry.type === 'Point')

    const maxCheckins = features
        .map(f => f.properties.checkins)
        .reduce((max, i) => Math.max(max, i), 0)

    return features
        .map(feature => {
            const geom = feature.geometry
            const props = feature.properties
            const coord = geom.coordinates.reverse()
            const radius = remap(props.checkins, [0, maxCheckins], [3, 50])

            console.log(props)

            const circle = L.circle(coord, {
                radius: radius,
                weight: 1,
                fillColor: '#f0f',
                fillOpacity: 1,
                stroke: null,
            })
            circle.addTo(appMap)
            circle.bindPopup(`<div>${propsToTable(props)}</div>`)
        })
}

function addGeoJsonTrack(geojson) {
    console.log('add', geojson)
    const track = L.geoJSON(geojson, {
        weight: 1,
        color: '#ff0',
        onEachFeature: (feature, layer) => {
            const props = feature.properties
            console.log(props)
            console.log(layer)

            const coords = feature.geometry.coordinates
            const times = props.coordTimes
                .map(i => new Date(i))
                .map(time => time.getTime())

            const timesDelta = segments(times)
                .map(([t1, t2]) => t2 - t1)
                .map(t => t / 1000)
                .map(t => t / 3600)

            const distDelta = segments(coords)
                .map(([c1, c2]) => turf.distance(c1, c2))

            const vs = zip(distDelta, timesDelta)
                .map(([d, t]) => d / t)

            const middleCoords = segments(coords)
                .map(([c1, c2]) => turf.midpoint(c1, c2))
                .map(i => i.geometry.coordinates)
                .map(i => i.reverse())

            zip(middleCoords, vs)
                .filter(([_, v]) => !!v)
                .forEach(([coord, speed]) => {
                    const circle = L.circle(coord, {
                        radius: speed * 1,
                        weight: 1,
                        fillColor: '#ff0',
                        fillOpacity: 1,
                        stroke: null,
                    })
                        .addTo(appMap)

                    const circleProps = omit(['links', 'coordTimes'])(Object.assign(props, {speed}))
                    circle.bindPopup(`<div>${propsToTable(circleProps)}</div>`)
                })
        }
    })

    track.addTo(appMap)
    return track
}

function getFeatures(geojson, filter) {
    const features = []
    L.geoJSON(geojson, {
        filter: isFunction(filter)
            ? filter
            : f => true,
        onEachFeature: feature => {
            features.push(feature)
        }
    })
    return features
}

function xmlDom(xml) {
    const p = new DOMParser();
    return p.parseFromString(xml, 'text/xml')
}

function propsToTable(props) {
    const rows = Object
        .keys(props)
        .map(name => [name, props[name]])
        .map(([name, value]) => `
            <tr>
                <td>${name}</td>
                <td>${value}</td>
            </tr>
        `)
        .join('')

    return `
        <table class="map-popup-table">
            <thead><tr>
                <th>Name</th>
                <th>Value</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>`
}

function isFunction(param) {
    return typeof param === 'function'
}

function toJson(value) {
    try {
        return typeof value === 'string'
            ? JSON.parse(value)
            : value
    } catch (e) {
        return value
    }
}

/**
 * f([x, y, z, ...], [m, n, k, ...]) -> [[x, m], [y, n], [z, k], ...]
 * @param list1
 * @param list2
 */
function zip(list1, list2) {
    const [small, other] = list1.length <= list2.length ? [list1, list2] : [list2, list1]
    return small.map((s, i) => [s, other[i]])
}

function segments(ts) {
    const r1 = range(0, len(ts) - 1)
    const r2 = range(1, len(ts))

    return zip(r1, r2)
        .map(([i, j]) => [ts[i], ts[j]])
}

function range(from, to, step = 1) {
    const list = []
    for (let i = from; i < to; i += step) {
        list.push(i)
    }
    return list
}

function len(param) {
    if (typeof param === 'string') return param.length
    return Array.isArray(param)
        ? param.length
        : null
}

function compose(...fns) {
    return value => [...fns]
        .reverse()
        .reduce((acc, fn) => fn(acc), value)
}

/**
 * Returns a closure for mapping array.
 * It asynchronously map values
 *
 * f(g) -> f([x, y, ...]) -> [g(x), g(y), ...]
 *
 * @param {Function} fn
 * @return {Function}
 */
function map(fn) {
    return list => Promise.all(list.map(fn))
}

/**
 *
 * f(xs) -> g(i) -> {...k if k not in xs}
 *
 * @return {function(*=)}
 * @param predicate
 */
function filterKeysBy(predicate) {
    return obj => Object
        .keys(obj)
        .filter(predicate)
        .reduce(
            (acc, key) => Object.assign(acc, {[key]: obj[key]}),
            {}
        )
}

/**
 *
 * f(xs) -> g(i) -> {...k if k not in xs}
 *
 * @param keys
 * @return {function(*=)}
 */
function omit(keys) {
    return keys
        ? filterKeysBy(k => !keys.includes(k))
        : i => i
}

function round(v, n) {
    return Math.round(v * n) / n
}

function endsWith(searchString, subjectString) {
    let position = subjectString.length
    position -= searchString.length
    const lastIndex = subjectString.indexOf(searchString, position)
    return lastIndex !== -1 && lastIndex === position
}

/**
 *
 * f(x, [m,n], [p,q]) -> x from m-n to y from p-q
 *
 * @param value
 * @param from
 * @param to
 */
function remap(value, from, to) {
    const r = (value - from[0]) / (from[1] - from[0])
    return to[0] + (to[1] - to[0]) * r
}


function addFlow(json) {
    // Converts from degrees to radians.
    function to_radians(degrees) {
        return degrees * Math.PI / 180;
    };

    function count_all_cats(item) {
        return item.data.school.length + item.data.y1017.length + item.data.stuptu.length +
            item.data.ku.length + item.data.z.length + item.data.rr.length + item.data.pens.length
    }

    function add_category_cricle(name, color, point, layer) {
        if (name in point.directions) {
            layer.addLayer(get_circle([point.lat, point.lon], point.directions[name].length, color))
        }
    }

    function get_composite_line(latlng, angle, parts) {
        var lg = L.layerGroup()
        var tmp_lenght = 0
        var new_length = 0
        var latlngs = []
        // angle = 0
        $.each(parts, function (index, part) {
            new_length = tmp_lenght + part.length
            lg.addLayer(get_line_by_angle(latlng, angle, tmp_lenght, new_length, part.color))
            tmp_lenght = new_length
        });

        return lg;
    };

    function get_categories() {
        return {
            'preschoolers': 'Дошкольники',
            'y1017': '10-17 лет',
            'students': 'Студенты',
            'cadets': 'Курсанты',
            'employeed': 'Занятые',
            'parent_children': 'Родители с детьми',
            'pensioners': 'Пенсионеры'
        }
    }

    function get_category_color(cat_name) {
        const colors = {
            employeed: 'Aquamarine',
            preschoolers: 'red',
            y1017: 'LightCyan',
            cadets: 'LightSalmon',
            students: 'cyan',
            employeed: 'MediumSpringGreen',
            parent_children: 'MediumPurple',
            pensioners: 'blue'
        }
        return colors[cat_name]
    }

    function add_direction(latlng, angle, cats, layer, length_ratio = 1) {
        // d1 = [{length:15, color:'red'}, {length:5, color:'blue'}, {length:10, color:'green'}]
        // d2 = [{length:30, color:'red'}]
        d = []
        $.each(cats, function (cat, count) {
            d.push({length: count * length_ratio, color: get_category_color(cat)})
        });
        layer.addLayer(get_composite_line(latlng, angle, d))
    }


    function get_angle(dir, point_number) {
        angles = {
            A: 0,
            B: 180,
            C: 225,
            D: 135,
            E: 270,
            F: 90,
            L: 315,
            K: 45
        }
        angle = angles[dir]
        if (point_number == 1) {
            angle = angle - 15
        }
        if (point_number == 2) {
            angle = angle - 15
        }
        if (point_number == 4) {
            angle = angle - 15
        }
        if (point_number == 5) {
            angle = angle - 15
        }
        // // if(point_number == 2){
        //     return angles[dir]
        // }
        return angle

    }

    function get_line_by_angle(latlon, angle, length_start, length_finish, color) {
        angle = to_radians(angle);
        var center_point = appMap.project(latlon, 17)
        var from_point = L.point(center_point.x + length_start * Math.sin(angle), center_point.y + length_start * Math.cos(angle))
        var to_point = L.point(center_point.x + length_finish * Math.sin(angle), center_point.y + length_finish * Math.cos(angle))
        var latlngs = [
            appMap.unproject(from_point, 17),
            appMap.unproject(to_point, 17)
        ];
        return L.polyline(latlngs, {color: color});
    };

    function test_rose(layer) {
        lg = L.layerGroup()
        var latlng = [59.882608, 29.896333]
        for (var i = 0; i < 10; i++) {
            lg.addLayer(get_line_by_angle(latlng, i * 36, 0, 100, 'red'))
            lg.addLayer(get_line_by_angle(latlng, i * 36, 100, 200, 'blue'))
        }
        lg.addTo(appMap)
    }


    function get_session_layer(points_data) {
        var layer = L.layerGroup();
        $.each(points_data, function (index, point) {
            if (index == index) {
                $.each(point.directions, function (dir_name, dir_data) {
                    add_direction([point.lat, point.lon], get_angle(dir_name, index), dir_data, layer, 2)
                });
                layer.addLayer(get_circle([point.lat, point.lon], 2, "red"))

            }
        });
        // test_rose(layer)

        return layer
    }

    function legend() {
        var legend = L.control({position: 'bottomright'});

        legend.onAdd = function (map) {

            var div = L.DomUtil.create('div', 'info legend'),
                labels = [];

            // loop through our density intervals and generate a label with a colored square for each interval
            $.each(get_categories(), function (cat, cat_descr) {
                div.innerHTML +=
                    '<i style="background:' + get_category_color(cat) + '"></i> ' + cat_descr + '<br>';
            });

            return div;
        };

        legend.addTo(appMap);
    }

    function draw(data) {
        var baseMaps = {
            // "Light": light,
            // "Dark": dark,
            // "Stamen_TonerLite": Stamen_TonerLite,
            // "Stamen_Watercolor": Stamen_Watercolor,
            // "OpenStreetMap_BlackAndWhite": OpenStreetMap_BlackAndWhite,
            // "Esri_WorldImagery": Esri_WorldImagery
        };

        var sessions_overlay = {};

        var show = true
        $.each(data, function (index, session) {
            l = get_session_layer(session.points)
            if (show) {
                l.addTo(appMap)
                show = false
            }
            sessions_overlay[session.description] = l
        });


        var groupedOverlays = {
            "Sessions": sessions_overlay,
        };

        var options = {
            // Make the "Landmarks" group exclusive (use radio inputs)
            exclusiveGroups: ["Sessions"]
            // Show a checkbox next to non-exclusive group labels for toggling all
            // groupCheckboxes: true
        };

        L.control.groupedLayers(baseMaps, groupedOverlays, options).addTo(appMap);
        legend()
        // L.control.layers(baseMaps, overlayMaps).addTo(appMap);
        // test_rose()
    };

    function get_circle(point, radius, color) {
        return L.circle(point, {
            color: color,
            fillColor: color,
            fillOpacity: 1,
            radius: radius
        });
    };

    function marker(point) {
        L.marker(point).addTo(appMap);
    }

    draw(json)
}
