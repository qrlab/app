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
    }

    const files = initialData.files
        ? initialData.files
        : []

    const checkins = files.filter(file => endsWith('checkins.geojson', file.name))
    const tracks = files.filter(file => endsWith('gpx', file.name))
    const images = files.filter(file => endsWith('images.geojson', file.name))

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