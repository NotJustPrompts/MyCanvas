export interface AspectRatioPreset {
  id: string;
  label: string;
  ratio: string;
  width: number;
  height: number;
}

export const ASPECT_RATIOS: AspectRatioPreset[] = [
  { id: "16:9", label: "Landscape 16:9", ratio: "16:9", width: 1280, height: 720 },
  { id: "9:16", label: "Portrait 9:16", ratio: "9:16", width: 720, height: 1280 },
  { id: "1:1", label: "Square 1:1", ratio: "1:1", width: 1080, height: 1080 },
  { id: "4:3", label: "Landscape 4:3", ratio: "4:3", width: 1024, height: 768 },
  { id: "3:4", label: "Portrait 3:4", ratio: "3:4", width: 768, height: 1024 },
  { id: "21:9", label: "Ultrawide 21:9", ratio: "21:9", width: 1680, height: 720 },
  { id: "9:21", label: "Tall 9:21", ratio: "9:21", width: 720, height: 1680 },
];
