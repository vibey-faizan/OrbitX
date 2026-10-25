/**
 * ORBITX — celestial body data.
 *
 * Values are rounded figures from the NASA Planetary Fact Sheet
 * (nssdc.gsfc.nasa.gov/planetary/factsheet) and NASA Science planet pages.
 * Temperatures for the giant planets are quoted at the 1-bar pressure level
 * because they have no solid surface. Moon counts change as discoveries are
 * confirmed, so each count carries a note describing what it represents.
 *
 * This file is the single source of truth: the 3D scene, info panel, cards,
 * search and comparison tool all read from it.
 */

export const SIM_CONFIG = Object.freeze({
  /** Simulated Earth days that pass per real second at 1× speed. */
  daysPerSecond: 5,
  /** J2000.0 epoch (2000-01-01 12:00 UTC), the reference for mean longitudes. */
  j2000: Date.UTC(2000, 0, 1, 12, 0, 0),
  msPerDay: 86_400_000,
  /** Moon's mean geocentric longitude at J2000 and its daily rate (degrees). */
  moonLongitudeJ2000: 218.316,
  moonDegreesPerDay: 13.176396,
});

export const DATA_SOURCES = [
  { label: 'NASA Planetary Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/' },
  { label: 'NASA Science — Solar System', url: 'https://science.nasa.gov/solar-system/' },
];

export const BODIES = [
  {
    id: 'sun',
    name: 'Sun',
    type: 'star',
    group: 'star',
    category: 'G-type main-sequence star',
    color: '#ffb347',
    aliases: ['star', 'sol'],
    tagline: 'The star at the heart of our Solar System.',
    intro:
      'The Sun is a nearly perfect sphere of hot plasma whose gravity holds the Solar System together. Nuclear fusion in its core turns hydrogen into helium, releasing the energy that lights and warms every planet.',
    stats: {
      diameterKm: 1_391_400,
      axialTiltDeg: 7.25,
    },
    display: {
      distanceLabel: 'Distance from Earth',
      distance: '≈149.6 million km · 1 AU (about 8 min 20 s at light speed)',
      orbit: '≈230 million years around the Milky Way’s centre (estimate)',
      rotation: '≈25 days at the equator, ≈35 days near the poles',
      temperature: '≈5,500 °C at the visible surface',
      temperatureNote: 'The core reaches roughly 15 million °C.',
      moonsLabel: 'Planets',
      moons: '8',
      tiltNote: 'Relative to the ecliptic.',
    },
    atmosphere:
      'Layered outer atmosphere: photosphere, chromosphere, transition region and the million-degree corona. By mass the Sun is roughly 73% hydrogen and 25% helium.',
    facts: [
      'The Sun contains about 99.8% of all the mass in the Solar System.',
      'Sunlight takes about 8 minutes and 20 seconds to reach Earth.',
      'Roughly 1.3 million Earths could fit inside the Sun by volume.',
    ],
  },
  {
    id: 'mercury',
    name: 'Mercury',
    type: 'planet',
    group: 'terrestrial',
    category: 'Terrestrial planet',
    color: '#a39b92',
    aliases: ['swift planet', 'innermost'],
    tagline: 'The smallest planet and the closest to the Sun.',
    intro:
      'Mercury is the smallest planet and the closest to the Sun. Its heavily cratered surface resembles Earth’s Moon, and with almost no atmosphere to hold heat it swings between scorching days and frigid nights.',
    stats: {
      diameterKm: 4_879,
      distanceMkm: 57.9,
      distanceAU: 0.387,
      orbitalPeriodDays: 88.0,
      rotationHours: 1_407.6,
      retrograde: false,
      meanTempC: 167,
      tempNote: 'Ranges from about −173 °C at night to 427 °C in the day.',
      moons: 0,
      axialTiltDeg: 0.03,
    },
    atmosphere:
      'Only a thin exosphere — atoms such as oxygen, sodium, hydrogen, helium and potassium knocked off the surface by the solar wind and micrometeoroid impacts.',
    facts: [
      'One solar day on Mercury (sunrise to sunrise) lasts about 176 Earth days — two Mercury years.',
      'Despite being closest to the Sun, Mercury is not the hottest planet; Venus is.',
      'Observations from NASA’s MESSENGER mission indicate water ice in permanently shadowed polar craters.',
    ],
    orbit: { meanLongitudeJ2000: 252.251 },
  },
  {
    id: 'venus',
    name: 'Venus',
    type: 'planet',
    group: 'terrestrial',
    category: 'Terrestrial planet',
    color: '#e0bb7a',
    aliases: ['morning star', 'evening star', 'hottest'],
    tagline: 'A runaway greenhouse world hidden beneath acid clouds.',
    intro:
      'Venus is similar in size to Earth, but a runaway greenhouse effect has made it the hottest planet in the Solar System. Thick clouds of sulfuric acid hide a volcanic surface beneath a crushing carbon-dioxide atmosphere.',
    stats: {
      diameterKm: 12_104,
      distanceMkm: 108.2,
      distanceAU: 0.723,
      orbitalPeriodDays: 224.7,
      rotationHours: 5_832.5,
      retrograde: true,
      meanTempC: 464,
      tempNote: 'Surface average — hot enough to melt lead, with little difference between day and night.',
      moons: 0,
      axialTiltDeg: 177.4,
    },
    atmosphere:
      'About 96.5% carbon dioxide and 3.5% nitrogen, with clouds of sulfuric acid. Surface pressure is roughly 92 times that on Earth.',
    facts: [
      'Venus spins backwards (retrograde) compared with most planets, so the Sun rises in the west.',
      'Its rotation period (243 Earth days) is longer than its year (about 225 Earth days).',
      'After the Moon, Venus is usually the brightest natural object in the night sky.',
    ],
    orbit: { meanLongitudeJ2000: 181.980 },
  },
  {
    id: 'earth',
    name: 'Earth',
    type: 'planet',
    group: 'terrestrial',
    category: 'Terrestrial planet',
    color: '#3a8ee6',
    aliases: ['blue planet', 'home', 'terra'],
    tagline: 'Our ocean world — the only place known to host life.',
    intro:
      'Earth is the only world known to support life. Liquid water covers about 71% of its surface, while its atmosphere and magnetic field help shield the surface and keep it habitable.',
    stats: {
      diameterKm: 12_756,
      distanceMkm: 149.6,
      distanceAU: 1.0,
      orbitalPeriodDays: 365.2,
      rotationHours: 23.9,
      retrograde: false,
      meanTempC: 15,
      tempNote: 'Approximate global mean surface temperature.',
      moons: 1,
      axialTiltDeg: 23.44,
    },
    atmosphere:
      'About 78% nitrogen and 21% oxygen, with argon, water vapour, carbon dioxide and other trace gases.',
    facts: [
      'Earth is the densest planet in the Solar System.',
      'Its axial tilt of about 23.4° is what gives us seasons.',
      'Earth’s rotation is very gradually slowing because of tidal interaction with the Moon.',
    ],
    orbit: { meanLongitudeJ2000: 100.464 },
  },
  {
    id: 'moon',
    name: 'Moon',
    type: 'moon',
    group: 'moon',
    category: 'Natural satellite of Earth',
    color: '#c9c9c9',
    aliases: ['luna', 'satellite'],
    tagline: 'Earth’s only natural satellite.',
    intro:
      'The Moon is Earth’s only natural satellite and the fifth-largest moon in the Solar System. Its gravity raises Earth’s ocean tides, and its cratered surface preserves a record of the early Solar System.',
    stats: {
      diameterKm: 3_475,
      orbitalPeriodDays: 27.3,
      rotationHours: 655.7,
      retrograde: false,
      axialTiltDeg: 6.68,
    },
    display: {
      distanceLabel: 'Distance from Earth',
      distance: '≈384,400 km (average)',
      orbit: '27.3 days around Earth',
      rotation: '27.3 days — synchronous with its orbit',
      temperature: '−173 °C to 127 °C',
      temperatureNote: 'Approximate night-time and day-time extremes near the equator.',
      moonsLabel: 'Orbits',
      moons: 'Earth',
      tiltNote: 'Relative to its orbital plane.',
    },
    atmosphere: 'An extremely thin exosphere — for most purposes, a vacuum.',
    facts: [
      'The Moon always shows the same face to Earth because it is tidally locked.',
      'It is slowly drifting away from Earth at about 3.8 cm per year.',
      'Twelve astronauts walked on the Moon during NASA’s Apollo program (1969–1972).',
    ],
  },
  {
    id: 'iss',
    name: 'ISS',
    type: 'satellite',
    group: 'satellite',
    category: 'Crewed space station in Earth orbit',
    color: '#d9e6ff',
    aliases: ['international space station', 'space station', 'satellite', 'station'],
    tagline: 'Humanity’s laboratory in low Earth orbit.',
    intro:
      'The International Space Station is a permanently crewed laboratory orbiting Earth, built and operated by the space agencies of the United States, Russia, Europe, Japan and Canada. Astronauts live and work aboard it, running experiments in microgravity.',
    stats: {},
    display: {
      diameter: '≈109 m long (truss) × ≈73 m (solar arrays)',
      distanceLabel: 'Altitude',
      distance: '≈400 km above Earth (varies, roughly 370–460 km)',
      orbit: '≈90 minutes around Earth — about 16 orbits a day',
      rotation: 'Held in a fixed orientation relative to Earth',
      temperature: '≈ −157 °C to 121 °C on sunlit vs shaded exterior surfaces',
      temperatureNote: 'The cabin itself is kept at a comfortable room temperature.',
      moonsLabel: 'Typical crew',
      moons: 'Usually 7 people (varies with crew rotations)',
    },
    atmosphere:
      'The pressurised modules hold Earth-like air — about 78% nitrogen and 21% oxygen at roughly sea-level pressure.',
    facts: [
      'Its first module, Zarya, launched in 1998, and people have lived aboard continuously since November 2000.',
      'It travels at about 28,000 km/h, fast enough to circle Earth roughly every 90 minutes.',
      'It is the largest human-made object in space and can often be seen from the ground with the naked eye.',
    ],
  },
  {
    id: 'mars',
    name: 'Mars',
    type: 'planet',
    group: 'terrestrial',
    category: 'Terrestrial planet',
    color: '#d0603a',
    aliases: ['red planet'],
    tagline: 'A cold desert world of giant volcanoes and canyons.',
    intro:
      'Mars is a cold, dusty desert world with the largest volcanoes and one of the deepest canyon systems in the Solar System. Its red colour comes from iron oxide — rust — in its rocks and dust.',
    stats: {
      diameterKm: 6_792,
      distanceMkm: 227.9,
      distanceAU: 1.524,
      orbitalPeriodDays: 687.0,
      rotationHours: 24.6,
      retrograde: false,
      meanTempC: -65,
      tempNote: 'Average; varies widely with location and season, from below −120 °C to around 20 °C.',
      moons: 2,
      moonsNote: 'Phobos and Deimos.',
      axialTiltDeg: 25.19,
    },
    atmosphere:
      'Thin — about 95% carbon dioxide, with nitrogen and argon. Surface pressure is less than 1% of Earth’s.',
    facts: [
      'Olympus Mons rises about 22 km — roughly two and a half times the height of Mount Everest above sea level.',
      'The Valles Marineris canyon system stretches more than 4,000 km.',
      'Mars has seasons like Earth because of a similar axial tilt, but each lasts about twice as long.',
    ],
    orbit: { meanLongitudeJ2000: 355.453 },
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    type: 'planet',
    group: 'gas-giant',
    category: 'Gas giant',
    color: '#d3a87c',
    aliases: ['great red spot', 'largest'],
    tagline: 'The giant of the Solar System, banded with storms.',
    intro:
      'Jupiter is the largest planet — more than twice as massive as all the other planets combined. This gas giant is wrapped in colourful cloud bands and storms, including the Great Red Spot.',
    stats: {
      diameterKm: 142_984,
      distanceMkm: 778.5,
      distanceAU: 5.2,
      orbitalPeriodDays: 4_331,
      rotationHours: 9.9,
      retrograde: false,
      meanTempC: -110,
      tempNote: 'At the 1-bar pressure level — Jupiter has no solid surface.',
      moons: 95,
      moonsNote: 'Officially recognized moons listed by NASA; small new moons are still being found.',
      axialTiltDeg: 3.13,
    },
    atmosphere:
      'Mostly hydrogen (~90%) and helium (~10%), with traces of methane, ammonia, water and other compounds that form its cloud bands.',
    facts: [
      'The Great Red Spot is a giant storm wider than Earth.',
      'Jupiter has the shortest day of any planet — just under 10 hours.',
      'Its moon Ganymede is the largest moon in the Solar System, bigger than the planet Mercury.',
    ],
    orbit: { meanLongitudeJ2000: 34.404 },
  },
  {
    id: 'saturn',
    name: 'Saturn',
    type: 'planet',
    group: 'gas-giant',
    category: 'Gas giant',
    color: '#e6cc8f',
    aliases: ['ringed planet', 'rings'],
    tagline: 'The jewel of the Solar System, crowned by icy rings.',
    intro:
      'Saturn is a gas giant famous for its spectacular rings, made of countless pieces of ice and rock. It is the least dense planet — its average density is lower than that of water.',
    stats: {
      diameterKm: 120_536,
      distanceMkm: 1_432.0,
      distanceAU: 9.57,
      orbitalPeriodDays: 10_747,
      rotationHours: 10.7,
      retrograde: false,
      meanTempC: -140,
      tempNote: 'At the 1-bar pressure level.',
      moons: 274,
      moonsNote: 'Recognized as of 2025, after 128 new moons were announced in March 2025.',
      axialTiltDeg: 26.73,
    },
    atmosphere: 'Mostly hydrogen and helium, with traces of methane, ammonia and other compounds.',
    facts: [
      'Saturn’s main rings span roughly 280,000 km yet are typically only about 10 metres thick.',
      'Its largest moon, Titan, has a thick nitrogen atmosphere and lakes of liquid methane and ethane.',
      'Saturn has more known moons than any other planet.',
    ],
    orbit: { meanLongitudeJ2000: 49.944 },
  },
  {
    id: 'uranus',
    name: 'Uranus',
    type: 'planet',
    group: 'ice-giant',
    category: 'Ice giant',
    color: '#9fe0e6',
    aliases: ['sideways planet', 'tilted'],
    tagline: 'An ice giant that rolls around the Sun on its side.',
    intro:
      'Uranus is an ice giant that rotates on its side, probably the result of an ancient collision. Methane in its atmosphere absorbs red light, giving the planet its pale blue-green colour.',
    stats: {
      diameterKm: 51_118,
      distanceMkm: 2_867.0,
      distanceAU: 19.2,
      orbitalPeriodDays: 30_589,
      rotationHours: 17.2,
      retrograde: true,
      meanTempC: -195,
      tempNote: 'At the 1-bar pressure level.',
      moons: 28,
      moonsNote: 'Per NASA; a further small moon (S/2025 U1) was reported from JWST observations in 2025.',
      axialTiltDeg: 97.77,
    },
    atmosphere:
      'Hydrogen (~83%), helium (~15%) and methane (~2%), above a deep interior rich in water, methane and ammonia ices.',
    facts: [
      'Its extreme tilt gives each pole about 42 years of continuous sunlight, then 42 years of darkness.',
      'Uranus was the first planet discovered with a telescope, by William Herschel in 1781.',
      'Uranus has 13 known rings, which are faint and dark.',
    ],
    orbit: { meanLongitudeJ2000: 313.232 },
  },
  {
    id: 'neptune',
    name: 'Neptune',
    type: 'planet',
    group: 'ice-giant',
    category: 'Ice giant',
    color: '#4a78e8',
    aliases: ['windiest', 'farthest'],
    tagline: 'The distant, wind-whipped blue world at the edge.',
    intro:
      'Neptune is the most distant planet from the Sun — a dark, cold ice giant with the fastest winds measured in the Solar System. It was the first planet found through mathematical prediction rather than direct observation.',
    stats: {
      diameterKm: 49_528,
      distanceMkm: 4_515.0,
      distanceAU: 30.1,
      orbitalPeriodDays: 59_800,
      rotationHours: 16.1,
      retrograde: false,
      meanTempC: -200,
      tempNote: 'At the 1-bar pressure level.',
      moons: 16,
      moonsNote: 'Including two small moons announced in 2024.',
      axialTiltDeg: 28.32,
    },
    atmosphere:
      'Hydrogen (~80%), helium (~19%) and methane (~1.5%), which helps give Neptune its blue colour.',
    facts: [
      'Winds on Neptune can exceed 2,000 km/h.',
      'In 2011 Neptune completed its first full orbit since its discovery in 1846.',
      'Its largest moon, Triton, orbits backwards and is probably a captured Kuiper Belt object.',
    ],
    orbit: { meanLongitudeJ2000: 304.880 },
  },
];

const bodyIndex = new Map(BODIES.map((body) => [body.id, body]));

/** The eight planets in order from the Sun. */
export const PLANETS = BODIES.filter((body) => body.type === 'planet');

/** Order used by the panel's previous/next buttons. */
export const NAVIGATION_ORDER = ['sun', ...PLANETS.map((planet) => planet.id)];

export function getBody(id) {
  return bodyIndex.get(id) ?? null;
}
