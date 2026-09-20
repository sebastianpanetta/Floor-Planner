# PlanCraft 2D/3D Floor Planner

An interactive web-based 2D and 3D floor planner application built with HTML5 Canvas, JavaScript, and Three.js.

![PlanCraft Floor Planner](https://img.shields.io/badge/Status-Active-brightgreen)
![License](https://img.shields.io/badge/License-MIT-blue)

## Features

- **2D Floor Plan Canvas**: Interactive top-down view to place, move, rotate, and resize room items.
- **3D Preview Mode**: Real-time 3D rendered view powered by **Three.js** with dynamic lighting, shadows, and orbit controls.
- **Undo / Redo (`Ctrl+Z` / `Ctrl+Y`)**: Complete history stack support for item moves, rotations, resizes, additions, deletions, property edits, and room updates.
- **Copy / Paste (`Ctrl+C` / `Ctrl+V`)**: Easily duplicate items across the canvas.
- **Startup Room Setup Modal**: Prompt for custom room dimensions (Width, Length, Height) upon launch.
- **Customizable Furniture Presets**: Customize default dimensions for built-in furniture items (Sofa, Bed, Table, Desk, Door, Window) with persistent `localStorage` storage.
- **Tape Measure Tool**: Measure exact distances anywhere inside the room in real time.
- **Grid Snap**: Toggleable snap-to-grid for precise alignment and 15° rotational snapping.
- **Export / Import**: Save and load floor plans via JSON files.

## Keyboard Shortcuts

| Shortcut | Description |
| --- | --- |
| `Ctrl + Z` | Undo last action |
| `Ctrl + Y` / `Ctrl + Shift + Z` | Redo last action |
| `Ctrl + C` | Copy selected item |
| `Ctrl + V` | Paste copied item |
| `Delete` / `Backspace` | Delete selected item |

## Getting Started

Simply open `index.html` in any modern web browser or serve via a local web server (e.g. Live Server). No build step required!

```bash
# Clone repository
git clone git@github.com:sebastianpanetta/Floor-Planner.git

# Open index.html in browser
```

## Technologies Used

- **HTML5 Canvas API** (2D Viewport)
- **Three.js** (3D Viewport & Lighting)
- **Plus Jakarta Sans** & **Font Awesome 6** (UI & Icons)
