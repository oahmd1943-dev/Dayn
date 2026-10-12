/* The rider's face is bundled (base64) because it is drawn onto the canvas
   every frame and is the heart of the game. The decorative icon is served
   from /public so the payload stays small — a pixel-art emoji is used as a
   graceful fallback if it is unavailable. */
import faceUrl from "../../public/wael-face.png";

export const FACE_URL = faceUrl;
export const ICON_URL = "/icon.png";
export const ICON_FALLBACK = "🏍️";
