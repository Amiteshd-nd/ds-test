/// <reference types="vite/client" />

declare module '*.geojson?url' {
  const src: string;
  export default src;
}
