import { useState } from 'react'
import './App.css'
import type { EventContext, Weather } from './module_bindings'
import { Stdb } from './Stdb';

function App() {
  const [weatherData, setWeatherData] = useState<Weather | null>(null);
  const stdb = new Stdb("ws://localhost:3000", "weather");

  stdb.conn.db.weather.onInsert((_ctx: EventContext, weather: Weather) => {
    setWeatherData(weather);
  });

  stdb.conn.db.weather.onDelete(() => {
    setWeatherData(null);
  })

  const fetchWeather = () => {
    stdb.conn.reducers.requestWeather("34.0522","-118.2437");
  };

  const clearWeather = () => {
    stdb.conn.reducers.clearWeather();
  };

  return (
    <div className="app">
      <div className='header-group'>
        <h5>(a spacetimedb web-request demo)</h5>
        <h1>Stdb Weather Forecast</h1>
      </div>

      <div className="button-group">
        <button onClick={fetchWeather}>Fetch Weather</button>
        <button onClick={clearWeather}>Clear Weather</button>
      </div>

      {weatherData ? (
        <div className="weather-info">
          <h2>Location Info</h2>
          <p><strong>Latitude:</strong> {weatherData.latitude}</p>
          <p><strong>Longitude:</strong> {weatherData.longitude}</p>
          <p><strong>Elevation:</strong> {weatherData.elevation} m</p>
          <p><strong>Timezone:</strong> {weatherData.timezone} ({weatherData.timezoneAbbreviation})</p>

          <h2>Hourly Temperatures</h2>
          <ul>
            {weatherData.hourly.time.map((unixTime, i) => (
              <li key={unixTime}>
                <strong>{new Date(Number(unixTime) * 1000).toLocaleTimeString()}</strong>: {weatherData.hourly.temperature2M[i]} {weatherData.hourlyUnits.temperature2M}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p>No weather data loaded.</p>
      )}
    </div>
  )
};

export default App;
