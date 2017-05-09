const quartariataPosition = [59.8853, 29.8975]
const appMap = L.map('mapid').setView(quartariataPosition, 16)

L.tileLayer('https://api.mapbox.com/styles/v1/mapbox/dark-v9/tiles/256/{z}/{x}/{y}?access_token=pk.eyJ1IjoidG1zaHYiLCJhIjoiM3BMLVc2MCJ9.PM9ukwAm-YUGlrBqt4V6vw', {
    attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="http://mapbox.com">Mapbox</a>',
    maxZoom: 18
}).addTo(appMap)

function main(initialData) {
    const files = initialData.files
        ? initialData.files
        : []
    const filesData = files.map(f => f.data)

    return map(compose(addGeoJsonTrack, toGeoJSON.gpx, xmlDom))(filesData)
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
                .forEach(([coord, v]) => {
                    const circle = L.circle(coord, {
                        radius: v * 1,
                        weight: 1,
                        fillColor: '#ff0',
                        fillOpacity: 1,
                        stroke: null,
                    })
                        .addTo(appMap)

                    circle.bindPopup(`${props.type} ${round(v, 10)} km/h`)
                })
        }
    })

    track.addTo(appMap)
    return track
}

function xmlDom(xml) {
    const p = new DOMParser();
    return p.parseFromString(xml, 'text/xml')
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

function round(v, n) {
    return Math.round(v * n) / n
}