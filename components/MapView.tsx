"use client";

import { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";

// Popravak za zadane ikone markera u bundleru (Next.js).
const icon = L.divIcon({
  className: "",
  html: `<div style="
    width:16px;height:16px;border-radius:50%;
    background:#5fe6c9;border:2px solid #0a0e14;
    box-shadow:0 0 12px #5fe6c9;"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom(), { animate: true });
  }, [lat, lng, map]);
  return null;
}

// Leaflet izmjeri kontejner samo jednom, pri inicijalizaciji. Budući da se
// MapView učitava lijeno (next/dynamic), taj trenutak katkad prethodi
// konačnom rasporedu stranice, pa karta ostane pogrešno/sivo iscrtana dok
// se nešto (npr. ručni resize prozora) ne dogodi. Zato eksplicitno
// zatražimo ponovno mjerenje odmah nakon montiranja (i mijenjamo je i dalje
// pratimo — panel oko karte je ručno promjenjive veličine, vidi .panel u
// globals.css).
function InvalidateOnResize() {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    const raf = requestAnimationFrame(() => map.invalidateSize());
    const container = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(container);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [map]);
  return null;
}

export interface MapPoint {
  lat: number;
  lng: number;
}

export default function MapView({
  position,
  track,
  height = 300,
  follow = false,
}: {
  position: MapPoint | null;
  track?: MapPoint[];
  height?: number;
  follow?: boolean;
}) {
  const center: [number, number] = position
    ? [position.lat, position.lng]
    : track && track.length
    ? [track[0].lat, track[0].lng]
    : [43.5081, 16.4402]; // Split, zadana lokacija

  return (
    <div
      style={{ height }}
      className="overflow-hidden rounded-xl border border-line"
    >
      <MapContainer
        center={center}
        zoom={14}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        {track && track.length > 1 && (
          <Polyline
            positions={track.map((p) => [p.lat, p.lng]) as [number, number][]}
            pathOptions={{ color: "#5fe6c9", weight: 3, opacity: 0.85 }}
          />
        )}
        {position && (
          <Marker position={[position.lat, position.lng]} icon={icon}>
            <Popup>
              {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
            </Popup>
          </Marker>
        )}
        {follow && position && <Recenter lat={position.lat} lng={position.lng} />}
        <InvalidateOnResize />
      </MapContainer>
    </div>
  );
}
