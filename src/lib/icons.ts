// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Icon layer — Lucide, rendered "straight": square stroke caps + miter joins and
 * sharp (rx-zeroed) rectangle corners, to match the geometric AltaStor brand.
 * Circles stay round because they are circles. Each glyph is an inline SVG
 * (fetched from the Lucide CDN and embedded — no runtime dep), re-exported under
 * the names the app already uses, so every `import { X } from "@/lib/icons"` and
 * `<X className="…" />` keeps working. Lucide names map 1:1 to these, so each
 * icon is exactly what its name says. Swapping the set = editing only this file.
 */
import {
  type ForwardRefExoticComponent,
  type ReactElement,
  type RefAttributes,
  type SVGProps,
  createElement,
  forwardRef,
} from "react";

export type AppIconProps = Omit<SVGProps<SVGSVGElement>, "ref"> & { size?: number | string };
export type LucideIcon = ForwardRefExoticComponent<AppIconProps & RefAttributes<SVGSVGElement>>;

/** One SVG child element: its tag plus geometry attributes. */
type El = { t: string } & Record<string, string>;

const BASE = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none",
  strokeLinecap: "square" as const,
  strokeLinejoin: "miter" as const,
};

function makeLucide(els: El[], displayName: string): LucideIcon {
  const Comp = forwardRef<SVGSVGElement, AppIconProps>((props, ref) => {
    const { size, color, strokeWidth, className, ...rest } = props;
    return createElement(
      "svg",
      {
        ref,
        ...BASE,
        width: size ?? 24,
        height: size ?? 24,
        stroke: color ?? "currentColor",
        strokeWidth: strokeWidth ?? 1.8,
        className: className ? `shrink-0 ${className}` : "shrink-0",
        ...rest,
      },
      ...els.map(({ t, ...attrs }, i) => createElement(t, { key: i, ...attrs })),
    );
  });
  Comp.displayName = displayName;
  return Comp;
}

/** Custom straight glyph (same call-site API) — for marks Lucide lacks. */
function makeSvg(displayName: string, children: ReactElement[]): LucideIcon {
  const Comp = forwardRef<SVGSVGElement, AppIconProps>((props, ref) => {
    const { size, color, strokeWidth, className, ...rest } = props;
    return createElement(
      "svg",
      {
        ref,
        ...BASE,
        width: size ?? 24,
        height: size ?? 24,
        stroke: color ?? "currentColor",
        strokeWidth: strokeWidth ?? 1.8,
        className: className ? `shrink-0 ${className}` : "shrink-0",
        ...rest,
      },
      ...children,
    );
  });
  Comp.displayName = displayName;
  return Comp;
}

/** `[tag, attrs]` pairs → keyed children, for the composed marks below. */
function els(list: Array<[string, Record<string, string | number>]>): ReactElement[] {
  return list.map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }));
}

/* ----- app name → Lucide glyph (rendered straight) ----- */
export const Activity = makeLucide([{"t":"path","d":"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"}], "Activity"); // lucide: activity
export const AlertCircle = makeLucide([{"t":"circle","cx":"12","cy":"12","r":"10"},{"t":"line","x1":"12","x2":"12","y1":"8","y2":"12"},{"t":"line","x1":"12","x2":"12.01","y1":"16","y2":"16"}], "AlertCircle"); // lucide: alert-circle
export const AlertOctagon = makeLucide([{"t":"path","d":"M12 16h.01"},{"t":"path","d":"M12 8v4"},{"t":"path","d":"M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z"}], "AlertOctagon"); // lucide: alert-octagon
export const AlertTriangle = makeLucide([{"t":"path","d":"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"},{"t":"path","d":"M12 9v4"},{"t":"path","d":"M12 17h.01"}], "AlertTriangle"); // lucide: alert-triangle
export const ArrowDown = makeLucide([{"t":"path","d":"M12 5v14"},{"t":"path","d":"m19 12-7 7-7-7"}], "ArrowDown"); // lucide: arrow-down
export const ArrowDownToLine = makeLucide([{"t":"path","d":"M12 17V3"},{"t":"path","d":"m6 11 6 6 6-6"},{"t":"path","d":"M19 21H5"}], "ArrowDownToLine"); // lucide: arrow-down-to-line
export const ArrowLeft = makeLucide([{"t":"path","d":"m12 19-7-7 7-7"},{"t":"path","d":"M19 12H5"}], "ArrowLeft"); // lucide: arrow-left
export const ArrowRight = makeLucide([{"t":"path","d":"M5 12h14"},{"t":"path","d":"m12 5 7 7-7 7"}], "ArrowRight"); // lucide: arrow-right
export const ArrowUp = makeLucide([{"t":"path","d":"m5 12 7-7 7 7"},{"t":"path","d":"M12 19V5"}], "ArrowUp"); // lucide: arrow-up
export const ArrowUpRight = makeLucide([{"t":"path","d":"M7 7h10v10"},{"t":"path","d":"M7 17 17 7"}], "ArrowUpRight"); // lucide: arrow-up-right
export const Bell = makeLucide([{"t":"path","d":"M10.268 21a2 2 0 0 0 3.464 0"},{"t":"path","d":"M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"}], "Bell"); // lucide: bell
export const Box = makeLucide([{"t":"path","d":"M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"},{"t":"path","d":"m3.3 7 8.7 5 8.7-5"},{"t":"path","d":"M12 22V12"}], "Box"); // lucide: box
export const Calendar = makeLucide([{"t":"path","d":"M8 2v4"},{"t":"path","d":"M16 2v4"},{"t":"rect","width":"18","height":"18","x":"3","y":"4"},{"t":"path","d":"M3 10h18"}], "Calendar"); // lucide: calendar
export const CalendarClock = makeLucide([{"t":"path","d":"M16 14v2.2l1.6 1"},{"t":"path","d":"M16 2v4"},{"t":"path","d":"M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"},{"t":"path","d":"M3 10h5"},{"t":"path","d":"M8 2v4"},{"t":"circle","cx":"16","cy":"16","r":"6"}], "CalendarClock"); // lucide: calendar-clock
export const CalendarDays = makeLucide([{"t":"path","d":"M8 2v4"},{"t":"path","d":"M16 2v4"},{"t":"rect","width":"18","height":"18","x":"3","y":"4"},{"t":"path","d":"M3 10h18"},{"t":"path","d":"M8 14h.01"},{"t":"path","d":"M12 14h.01"},{"t":"path","d":"M16 14h.01"},{"t":"path","d":"M8 18h.01"},{"t":"path","d":"M12 18h.01"},{"t":"path","d":"M16 18h.01"}], "CalendarDays"); // lucide: calendar-days
export const Check = makeLucide([{"t":"path","d":"M20 6 9 17l-5-5"}], "Check"); // lucide: check
export const CheckCircle2 = makeLucide([{"t":"circle","cx":"12","cy":"12","r":"10"},{"t":"path","d":"m9 12 2 2 4-4"}], "CheckCircle2"); // lucide: check-circle-2
export const ChevronsLeft = makeLucide([{"t":"path","d":"m11 17-5-5 5-5"},{"t":"path","d":"m18 17-5-5 5-5"}], "ChevronsLeft"); // lucide: chevrons-left
export const ChevronsUpDown = makeLucide([{"t":"path","d":"m7 15 5 5 5-5"},{"t":"path","d":"m7 9 5-5 5 5"}], "ChevronsUpDown"); // lucide: chevrons-up-down
export const CircleDot = makeLucide([{"t":"circle","cx":"12","cy":"12","r":"10"},{"t":"circle","cx":"12","cy":"12","r":"1"}], "CircleDot"); // lucide: circle-dot
export const Clock = makeLucide([{"t":"circle","cx":"12","cy":"12","r":"10"},{"t":"path","d":"M12 6v6l4 2"}], "Clock"); // lucide: clock
export const Cloud = makeLucide([{"t":"path","d":"M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"}], "Cloud"); // lucide: cloud
export const CopyPlus = makeLucide([{"t":"line","x1":"15","x2":"15","y1":"12","y2":"18"},{"t":"line","x1":"12","x2":"18","y1":"15","y2":"15"},{"t":"rect","width":"14","height":"14","x":"8","y":"8"},{"t":"path","d":"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"}], "CopyPlus"); // lucide: copy-plus
export const Cpu = makeLucide([{"t":"path","d":"M12 20v2"},{"t":"path","d":"M12 2v2"},{"t":"path","d":"M17 20v2"},{"t":"path","d":"M17 2v2"},{"t":"path","d":"M2 12h2"},{"t":"path","d":"M2 17h2"},{"t":"path","d":"M2 7h2"},{"t":"path","d":"M20 12h2"},{"t":"path","d":"M20 17h2"},{"t":"path","d":"M20 7h2"},{"t":"path","d":"M7 20v2"},{"t":"path","d":"M7 2v2"},{"t":"rect","x":"4","y":"4","width":"16","height":"16"},{"t":"rect","x":"8","y":"8","width":"8","height":"8"}], "Cpu"); // lucide: cpu
export const Database = makeLucide([{"t":"ellipse","cx":"12","cy":"5","rx":"9","ry":"3"},{"t":"path","d":"M3 5V19A9 3 0 0 0 21 19V5"},{"t":"path","d":"M3 12A9 3 0 0 0 21 12"}], "Database"); // lucide: database
export const DatabaseBackup = makeLucide([{"t":"ellipse","cx":"12","cy":"5","rx":"9","ry":"3"},{"t":"path","d":"M3 12a9 3 0 0 0 5 2.69"},{"t":"path","d":"M21 9.3V5"},{"t":"path","d":"M3 5v14a9 3 0 0 0 6.47 2.88"},{"t":"path","d":"M12 12v4h4"},{"t":"path","d":"M13 20a5 5 0 0 0 9-3 4.5 4.5 0 0 0-4.5-4.5c-1.33 0-2.54.54-3.41 1.41L12 16"}], "DatabaseBackup"); // lucide: database-backup
export const Download = makeLucide([{"t":"path","d":"M12 15V3"},{"t":"path","d":"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"},{"t":"path","d":"m7 10 5 5 5-5"}], "Download"); // lucide: download
export const File = makeLucide([{"t":"path","d":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"},{"t":"path","d":"M14 2v5a1 1 0 0 0 1 1h5"}], "File"); // lucide: file
export const FileCode = makeLucide([{"t":"path","d":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"},{"t":"path","d":"M14 2v5a1 1 0 0 0 1 1h5"},{"t":"path","d":"M10 12.5 8 15l2 2.5"},{"t":"path","d":"m14 12.5 2 2.5-2 2.5"}], "FileCode"); // lucide: file-code
export const FileText = makeLucide([{"t":"path","d":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"},{"t":"path","d":"M14 2v5a1 1 0 0 0 1 1h5"},{"t":"path","d":"M10 9H8"},{"t":"path","d":"M16 13H8"},{"t":"path","d":"M16 17H8"}], "FileText"); // lucide: file-text
export const Folder = makeLucide([{"t":"path","d":"M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"}], "Folder"); // lucide: folder
export const FolderOpen = makeLucide([{"t":"path","d":"m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"}], "FolderOpen"); // lucide: folder-open
export const FolderTree = makeLucide([{"t":"path","d":"M20 10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2.5a1 1 0 0 1-.8-.4l-.9-1.2A1 1 0 0 0 15 3h-2a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1Z"},{"t":"path","d":"M20 21a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1h-2.9a1 1 0 0 1-.88-.55l-.42-.85a1 1 0 0 0-.92-.6H13a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1Z"},{"t":"path","d":"M3 5a2 2 0 0 0 2 2h3"},{"t":"path","d":"M3 3v13a2 2 0 0 0 2 2h3"}], "FolderTree"); // lucide: folder-tree
export const Gauge = makeLucide([{"t":"path","d":"m12 14 4-4"},{"t":"path","d":"M3.34 19a10 10 0 1 1 17.32 0"}], "Gauge"); // lucide: gauge
export const HardDrive = makeLucide([{"t":"path","d":"M10 16h.01"},{"t":"path","d":"M2.212 11.577a2 2 0 0 0-.212.896V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5.527a2 2 0 0 0-.212-.896L18.55 5.11A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"},{"t":"path","d":"M21.946 12.013H2.054"},{"t":"path","d":"M6 16h.01"}], "HardDrive"); // lucide: hard-drive
export const HardDriveDownload = makeLucide([{"t":"path","d":"M12 2v8"},{"t":"path","d":"m16 6-4 4-4-4"},{"t":"rect","width":"20","height":"8","x":"2","y":"14"},{"t":"path","d":"M6 18h.01"},{"t":"path","d":"M10 18h.01"}], "HardDriveDownload"); // lucide: hard-drive-download
export const HelpCircle = makeLucide([{"t":"circle","cx":"12","cy":"12","r":"10"},{"t":"path","d":"M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"},{"t":"path","d":"M12 17h.01"}], "HelpCircle"); // lucide: help-circle
export const Inbox = makeLucide([{"t":"polyline","points":"22 12 16 12 14 15 10 15 8 12 2 12"},{"t":"path","d":"M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"}], "Inbox"); // lucide: inbox
export const Info = makeLucide([{"t":"circle","cx":"12","cy":"12","r":"10"},{"t":"path","d":"M12 16v-4"},{"t":"path","d":"M12 8h.01"}], "Info"); // lucide: info
export const Layers = makeLucide([{"t":"path","d":"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"},{"t":"path","d":"M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"},{"t":"path","d":"M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"}], "Layers"); // lucide: layers
export const LayoutDashboard = makeLucide([{"t":"rect","width":"7","height":"9","x":"3","y":"3"},{"t":"rect","width":"7","height":"5","x":"14","y":"3"},{"t":"rect","width":"7","height":"9","x":"14","y":"12"},{"t":"rect","width":"7","height":"5","x":"3","y":"16"}], "LayoutDashboard"); // lucide: layout-dashboard
export const Loader2 = makeLucide([{"t":"path","d":"M21 12a9 9 0 1 1-6.219-8.56"}], "Loader2"); // lucide: loader-2
export const Lock = makeLucide([{"t":"rect","width":"18","height":"11","x":"3","y":"11"},{"t":"path","d":"M7 11V7a5 5 0 0 1 10 0v4"}], "Lock"); // lucide: lock
export const LockKeyhole = makeLucide([{"t":"circle","cx":"12","cy":"16","r":"1"},{"t":"rect","x":"3","y":"10","width":"18","height":"12"},{"t":"path","d":"M7 10V7a5 5 0 0 1 10 0v3"}], "LockKeyhole"); // lucide: lock-keyhole
export const MapPin = makeLucide([{"t":"path","d":"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"},{"t":"circle","cx":"12","cy":"10","r":"3"}], "MapPin"); // lucide: map-pin
export const MemoryStick = makeLucide([{"t":"path","d":"M12 12v-2"},{"t":"path","d":"M12 18v-2"},{"t":"path","d":"M16 12v-2"},{"t":"path","d":"M16 18v-2"},{"t":"path","d":"M2 11h1.5"},{"t":"path","d":"M20 18v-2"},{"t":"path","d":"M20.5 11H22"},{"t":"path","d":"M4 18v-2"},{"t":"path","d":"M8 12v-2"},{"t":"path","d":"M8 18v-2"},{"t":"rect","x":"2","y":"6","width":"20","height":"10"}], "MemoryStick"); // lucide: memory-stick
export const Menu = makeLucide([{"t":"path","d":"M4 5h16"},{"t":"path","d":"M4 12h16"},{"t":"path","d":"M4 19h16"}], "Menu"); // lucide: menu
export const Minus = makeLucide([{"t":"path","d":"M5 12h14"}], "Minus"); // lucide: minus
export const Moon = makeLucide([{"t":"path","d":"M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"}], "Moon"); // lucide: moon
export const MoreHorizontal = makeLucide([{"t":"circle","cx":"12","cy":"12","r":"1"},{"t":"circle","cx":"19","cy":"12","r":"1"},{"t":"circle","cx":"5","cy":"12","r":"1"}], "MoreHorizontal"); // lucide: more-horizontal
export const Network = makeLucide([{"t":"rect","x":"16","y":"16","width":"6","height":"6"},{"t":"rect","x":"2","y":"16","width":"6","height":"6"},{"t":"rect","x":"9","y":"2","width":"6","height":"6"},{"t":"path","d":"M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"},{"t":"path","d":"M12 12V8"}], "Network"); // lucide: network
export const Pause = makeLucide([{"t":"rect","x":"14","y":"3","width":"5","height":"18"},{"t":"rect","x":"5","y":"3","width":"5","height":"18"}], "Pause"); // lucide: pause
export const Pencil = makeLucide([{"t":"path","d":"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"},{"t":"path","d":"m15 5 4 4"}], "Pencil"); // lucide: pencil
export const Play = makeLucide([{"t":"path","d":"M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"}], "Play"); // lucide: play
export const Plus = makeLucide([{"t":"path","d":"M5 12h14"},{"t":"path","d":"M12 5v14"}], "Plus"); // lucide: plus
export const Radio = makeLucide([{"t":"path","d":"M16.247 7.761a6 6 0 0 1 0 8.478"},{"t":"path","d":"M19.075 4.933a10 10 0 0 1 0 14.134"},{"t":"path","d":"M4.925 19.067a10 10 0 0 1 0-14.134"},{"t":"path","d":"M7.753 16.239a6 6 0 0 1 0-8.478"},{"t":"circle","cx":"12","cy":"12","r":"2"}], "Radio"); // lucide: radio
export const Repeat = makeLucide([{"t":"path","d":"m17 2 4 4-4 4"},{"t":"path","d":"M3 11v-1a4 4 0 0 1 4-4h14"},{"t":"path","d":"m7 22-4-4 4-4"},{"t":"path","d":"M21 13v1a4 4 0 0 1-4 4H3"}], "Repeat"); // lucide: repeat
export const RotateCcw = makeLucide([{"t":"path","d":"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"},{"t":"path","d":"M3 3v5h5"}], "RotateCcw"); // lucide: rotate-ccw
export const RotateCw = makeLucide([{"t":"path","d":"M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"},{"t":"path","d":"M21 3v5h-5"}], "RotateCw"); // lucide: rotate-cw
export const Search = makeLucide([{"t":"path","d":"m21 21-4.34-4.34"},{"t":"circle","cx":"11","cy":"11","r":"8"}], "Search"); // lucide: search
export const Server = makeLucide([{"t":"rect","width":"20","height":"8","x":"2","y":"2"},{"t":"rect","width":"20","height":"8","x":"2","y":"14"},{"t":"line","x1":"6","x2":"6.01","y1":"6","y2":"6"},{"t":"line","x1":"6","x2":"6.01","y1":"18","y2":"18"}], "Server"); // lucide: server
export const ServerCog = makeLucide([{"t":"path","d":"m10.852 14.772-.383.923"},{"t":"path","d":"M13.148 14.772a3 3 0 1 0-2.296-5.544l-.383-.923"},{"t":"path","d":"m13.148 9.228.383-.923"},{"t":"path","d":"m13.53 15.696-.382-.924a3 3 0 1 1-2.296-5.544"},{"t":"path","d":"m14.772 10.852.923-.383"},{"t":"path","d":"m14.772 13.148.923.383"},{"t":"path","d":"M4.5 10H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-.5"},{"t":"path","d":"M4.5 14H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-.5"},{"t":"path","d":"M6 18h.01"},{"t":"path","d":"M6 6h.01"},{"t":"path","d":"m9.228 10.852-.923-.383"},{"t":"path","d":"m9.228 13.148-.923.383"}], "ServerCog"); // lucide: server-cog
export const ServerOff = makeLucide([{"t":"path","d":"M7 2h13a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-5"},{"t":"path","d":"M10 10 2.5 2.5C2 2 2 2.5 2 5v3a2 2 0 0 0 2 2h6z"},{"t":"path","d":"M22 17v-1a2 2 0 0 0-2-2h-1"},{"t":"path","d":"M4 14a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16.5l1-.5.5.5-8-8H4z"},{"t":"path","d":"M6 18h.01"},{"t":"path","d":"m2 2 20 20"}], "ServerOff"); // lucide: server-off
export const Settings2 = makeLucide([{"t":"path","d":"M14 17H5"},{"t":"path","d":"M19 7h-9"},{"t":"circle","cx":"17","cy":"17","r":"3"},{"t":"circle","cx":"7","cy":"7","r":"3"}], "Settings2"); // lucide: settings-2
export const Shield = makeLucide([{"t":"path","d":"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"}], "Shield"); // lucide: shield
export const ShieldAlert = makeLucide([{"t":"path","d":"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"},{"t":"path","d":"M12 8v4"},{"t":"path","d":"M12 16h.01"}], "ShieldAlert"); // lucide: shield-alert
export const ShieldCheck = makeLucide([{"t":"path","d":"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"},{"t":"path","d":"m9 12 2 2 4-4"}], "ShieldCheck"); // lucide: shield-check
export const ShieldOff = makeLucide([{"t":"path","d":"m2 2 20 20"},{"t":"path","d":"M5 5a1 1 0 0 0-1 1v7c0 5 3.5 7.5 7.67 8.94a1 1 0 0 0 .67.01c2.35-.82 4.48-1.97 5.9-3.71"},{"t":"path","d":"M9.309 3.652A12.252 12.252 0 0 0 11.24 2.28a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1v7a9.784 9.784 0 0 1-.08 1.264"}], "ShieldOff"); // lucide: shield-off
export const Sliders = makeLucide([{"t":"path","d":"M10 8h4"},{"t":"path","d":"M12 21v-9"},{"t":"path","d":"M12 8V3"},{"t":"path","d":"M17 16h4"},{"t":"path","d":"M19 12V3"},{"t":"path","d":"M19 21v-5"},{"t":"path","d":"M3 14h4"},{"t":"path","d":"M5 10V3"},{"t":"path","d":"M5 21v-7"}], "Sliders"); // lucide: sliders
export const SlidersHorizontal = makeLucide([{"t":"path","d":"M10 5H3"},{"t":"path","d":"M12 19H3"},{"t":"path","d":"M14 3v4"},{"t":"path","d":"M16 17v4"},{"t":"path","d":"M21 12h-9"},{"t":"path","d":"M21 19h-5"},{"t":"path","d":"M21 5h-7"},{"t":"path","d":"M8 10v4"},{"t":"path","d":"M8 12H3"}], "SlidersHorizontal"); // lucide: sliders-horizontal
export const Sparkles = makeLucide([{"t":"path","d":"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"},{"t":"path","d":"M20 2v4"},{"t":"path","d":"M22 4h-4"},{"t":"circle","cx":"4","cy":"20","r":"2"}], "Sparkles"); // lucide: sparkles
export const Sun = makeLucide([{"t":"circle","cx":"12","cy":"12","r":"4"},{"t":"path","d":"M12 2v2"},{"t":"path","d":"M12 20v2"},{"t":"path","d":"m4.93 4.93 1.41 1.41"},{"t":"path","d":"m17.66 17.66 1.41 1.41"},{"t":"path","d":"M2 12h2"},{"t":"path","d":"M20 12h2"},{"t":"path","d":"m6.34 17.66-1.41 1.41"},{"t":"path","d":"m19.07 4.93-1.41 1.41"}], "Sun"); // lucide: sun
export const Terminal = makeLucide([{"t":"path","d":"M12 19h8"},{"t":"path","d":"m4 17 6-6-6-6"}], "Terminal"); // lucide: terminal
export const Timer = makeLucide([{"t":"line","x1":"10","x2":"14","y1":"2","y2":"2"},{"t":"line","x1":"12","x2":"15","y1":"14","y2":"11"},{"t":"circle","cx":"12","cy":"14","r":"8"}], "Timer"); // lucide: timer
export const Tower = makeLucide([{"t":"rect","width":"14","height":"20","x":"5","y":"2"},{"t":"path","d":"M15 14h.01"},{"t":"path","d":"M9 6h6"},{"t":"path","d":"M9 10h6"}], "Tower"); // lucide: pc-case
export const Trash2 = makeLucide([{"t":"path","d":"M10 11v6"},{"t":"path","d":"M14 11v6"},{"t":"path","d":"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"},{"t":"path","d":"M3 6h18"},{"t":"path","d":"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"}], "Trash2"); // lucide: trash-2
export const User = makeLucide([{"t":"path","d":"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"},{"t":"circle","cx":"12","cy":"7","r":"4"}], "User"); // lucide: user
export const X = makeLucide([{"t":"path","d":"M18 6 6 18"},{"t":"path","d":"m6 6 12 12"}], "X"); // lucide: x
export const XCircle = makeLucide([{"t":"circle","cx":"12","cy":"12","r":"10"},{"t":"path","d":"m15 9-6 6"},{"t":"path","d":"m9 9 6 6"}], "XCircle"); // lucide: x-circle
export const Analytics = makeLucide([{"t":"path","d":"M3 3v16a2 2 0 0 0 2 2h16"},{"t":"path","d":"m19 9-5 5-4-4-3 3"}], "Analytics"); // lucide: chart-line
export const AtSign = makeLucide([{"t":"circle","cx":"12","cy":"12","r":"4"},{"t":"path","d":"M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"}], "AtSign"); // lucide: at-sign
export const BarChart3 = makeLucide([{"t":"path","d":"M3 3v16a2 2 0 0 0 2 2h16"},{"t":"path","d":"M18 17V9"},{"t":"path","d":"M13 17V5"},{"t":"path","d":"M8 17v-3"}], "BarChart3"); // lucide: bar-chart-3
export const CalendarCog = makeLucide([{"t":"path","d":"m15.228 16.852-.923-.383"},{"t":"path","d":"m15.228 19.148-.923.383"},{"t":"path","d":"M16 2v4"},{"t":"path","d":"m16.47 14.305.382.923"},{"t":"path","d":"m16.852 20.772-.383.924"},{"t":"path","d":"m19.148 15.228.383-.923"},{"t":"path","d":"m19.53 21.696-.382-.924"},{"t":"path","d":"m20.772 16.852.924-.383"},{"t":"path","d":"m20.772 19.148.924.383"},{"t":"path","d":"M21 10.592V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6"},{"t":"path","d":"M3 10h18"},{"t":"path","d":"M8 2v4"},{"t":"circle","cx":"18","cy":"18","r":"3"}], "CalendarCog"); // lucide: calendar-cog
export const Coins = makeLucide([{"t":"path","d":"M13.744 17.736a6 6 0 1 1-7.48-7.48"},{"t":"path","d":"M15 6h1v4"},{"t":"path","d":"m6.134 14.768.866-.5 2 3.464"},{"t":"circle","cx":"16","cy":"8","r":"6"}], "Coins"); // lucide: coins
export const Cog = makeLucide([{"t":"path","d":"M11 10.27 7 3.34"},{"t":"path","d":"m11 13.73-4 6.93"},{"t":"path","d":"M12 22v-2"},{"t":"path","d":"M12 2v2"},{"t":"path","d":"M14 12h8"},{"t":"path","d":"m17 20.66-1-1.73"},{"t":"path","d":"m17 3.34-1 1.73"},{"t":"path","d":"M2 12h2"},{"t":"path","d":"m20.66 17-1.73-1"},{"t":"path","d":"m20.66 7-1.73 1"},{"t":"path","d":"m3.34 17 1.73-1"},{"t":"path","d":"m3.34 7 1.73 1"},{"t":"circle","cx":"12","cy":"12","r":"2"},{"t":"circle","cx":"12","cy":"12","r":"8"}], "Cog"); // lucide: cog
export const Copy = makeLucide([{"t":"rect","width":"14","height":"14","x":"8","y":"8"},{"t":"path","d":"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"}], "Copy"); // lucide: copy
export const ExternalLink = makeLucide([{"t":"path","d":"M15 3h6v6"},{"t":"path","d":"M10 14 21 3"},{"t":"path","d":"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"}], "ExternalLink"); // lucide: external-link
export const Eye = makeLucide([{"t":"path","d":"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"},{"t":"circle","cx":"12","cy":"12","r":"3"}], "Eye"); // lucide: eye
export const EyeOff = makeLucide([{"t":"path","d":"M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"},{"t":"path","d":"M14.084 14.158a3 3 0 0 1-4.242-4.242"},{"t":"path","d":"M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"},{"t":"path","d":"m2 2 20 20"}], "EyeOff"); // lucide: eye-off
export const FileCheck = makeLucide([{"t":"path","d":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"},{"t":"path","d":"M14 2v5a1 1 0 0 0 1 1h5"},{"t":"path","d":"m9 15 2 2 4-4"}], "FileCheck"); // lucide: file-check
export const FileDown = makeLucide([{"t":"path","d":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"},{"t":"path","d":"M14 2v5a1 1 0 0 0 1 1h5"},{"t":"path","d":"M12 18v-6"},{"t":"path","d":"m9 15 3 3 3-3"}], "FileDown"); // lucide: file-down
export const Filter = makeLucide([{"t":"path","d":"M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z"}], "Filter"); // lucide: filter
export const Globe = makeLucide([{"t":"circle","cx":"12","cy":"12","r":"10"},{"t":"path","d":"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"},{"t":"path","d":"M2 12h20"}], "Globe"); // lucide: globe
export const Key = makeLucide([{"t":"path","d":"m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"},{"t":"path","d":"m21 2-9.6 9.6"},{"t":"circle","cx":"7.5","cy":"15.5","r":"5.5"}], "Key"); // lucide: key
export const KeyRound = makeLucide([{"t":"path","d":"M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"},{"t":"circle","cx":"16.5","cy":"7.5","r":".5"}], "KeyRound"); // lucide: key-round
export const LineChart = makeLucide([{"t":"path","d":"M3 3v16a2 2 0 0 0 2 2h16"},{"t":"path","d":"m19 9-5 5-4-4-3 3"}], "LineChart"); // lucide: line-chart
export const LogOut = makeLucide([{"t":"path","d":"m16 17 5-5-5-5"},{"t":"path","d":"M21 12H9"},{"t":"path","d":"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"}], "LogOut"); // lucide: log-out
export const Mail = makeLucide([{"t":"path","d":"m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"},{"t":"rect","x":"2","y":"4","width":"20","height":"16"}], "Mail"); // lucide: mail
export const Monitor = makeLucide([{"t":"rect","width":"20","height":"14","x":"2","y":"3"},{"t":"line","x1":"8","x2":"16","y1":"21","y2":"21"},{"t":"line","x1":"12","x2":"12","y1":"17","y2":"21"}], "Monitor"); // lucide: monitor
export const Package = makeLucide([{"t":"path","d":"M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"},{"t":"path","d":"M12 22V12"},{"t":"polyline","points":"3.29 7 12 12 20.71 7"},{"t":"path","d":"m7.5 4.27 9 5.15"}], "Package"); // lucide: package
export const Palette = makeLucide([{"t":"path","d":"M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"},{"t":"circle","cx":"13.5","cy":"6.5","r":".5"},{"t":"circle","cx":"17.5","cy":"10.5","r":".5"},{"t":"circle","cx":"6.5","cy":"12.5","r":".5"},{"t":"circle","cx":"8.5","cy":"7.5","r":".5"}], "Palette"); // lucide: palette
export const PieChart = makeLucide([{"t":"path","d":"M21 12c.552 0 1.005-.449.95-.998a10 10 0 0 0-8.953-8.951c-.55-.055-.998.398-.998.95v8a1 1 0 0 0 1 1z"},{"t":"path","d":"M21.21 15.89A10 10 0 1 1 8 2.83"}], "PieChart"); // lucide: pie-chart
export const RefreshCw = makeLucide([{"t":"path","d":"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"},{"t":"path","d":"M21 3v5h-5"},{"t":"path","d":"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"},{"t":"path","d":"M8 16H3v5"}], "RefreshCw"); // lucide: refresh-cw
export const Settings = makeLucide([{"t":"path","d":"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"},{"t":"circle","cx":"12","cy":"12","r":"3"}], "Settings"); // lucide: settings
export const Smartphone = makeLucide([{"t":"rect","width":"14","height":"20","x":"5","y":"2"},{"t":"path","d":"M12 18h.01"}], "Smartphone"); // lucide: smartphone
export const TrendingUp = makeLucide([{"t":"path","d":"M16 7h6v6"},{"t":"path","d":"m22 7-8.5 8.5-5-5L2 17"}], "TrendingUp"); // lucide: trending-up
export const Users = makeLucide([{"t":"path","d":"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"},{"t":"path","d":"M16 3.128a4 4 0 0 1 0 7.744"},{"t":"path","d":"M22 21v-2a4 4 0 0 0-3-3.87"},{"t":"circle","cx":"9","cy":"7","r":"4"}], "Users"); // lucide: users
export const UserCog = makeLucide([{"t":"path","d":"M10 15H6a4 4 0 0 0-4 4v2"},{"t":"path","d":"m14.305 16.53.923-.382"},{"t":"path","d":"m15.228 13.852-.923-.383"},{"t":"path","d":"m16.852 12.228-.383-.923"},{"t":"path","d":"m16.852 17.772-.383.924"},{"t":"path","d":"m19.148 12.228.383-.923"},{"t":"path","d":"m19.53 18.696-.382-.924"},{"t":"path","d":"m20.772 13.852.924-.383"},{"t":"path","d":"m20.772 16.148.924.383"},{"t":"circle","cx":"18","cy":"15","r":"3"},{"t":"circle","cx":"9","cy":"7","r":"4"}], "UserCog"); // lucide: user-cog
export const Webhook = makeLucide([{"t":"path","d":"M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2"},{"t":"path","d":"m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06"},{"t":"path","d":"m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8"}], "Webhook"); // lucide: webhook
export const Wifi = makeLucide([{"t":"path","d":"M12 20h.01"},{"t":"path","d":"M2 8.82a15 15 0 0 1 20 0"},{"t":"path","d":"M5 12.859a10 10 0 0 1 14 0"},{"t":"path","d":"M8.5 16.429a5 5 0 0 1 7 0"}], "Wifi"); // lucide: wifi
export const Wrench = makeLucide([{"t":"path","d":"M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z"}], "Wrench"); // lucide: wrench
export const Zap = makeLucide([{"t":"path","d":"M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"}], "Zap"); // lucide: zap
export const Save = makeLucide([{"t":"path","d":"M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"},{"t":"path","d":"M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"},{"t":"path","d":"M7 3v4a1 1 0 0 0 1 1h7"}], "Save"); // lucide: save
export const ChevronDown = makeLucide([{"t":"path","d":"m6 9 6 6 6-6"}], "ChevronDown"); // lucide: chevron-down
export const ChevronLeft = makeLucide([{"t":"path","d":"m15 18-6-6 6-6"}], "ChevronLeft"); // lucide: chevron-left
export const ChevronRight = makeLucide([{"t":"path","d":"m9 18 6-6-6-6"}], "ChevronRight"); // lucide: chevron-right
export const History = makeLucide([{"t":"path","d":"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"},{"t":"path","d":"M3 3v5h5"},{"t":"path","d":"M12 7v5l4 2"}], "History"); // lucide: history
export const Hand = makeLucide([{"t":"path","d":"M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"},{"t":"path","d":"M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"},{"t":"path","d":"M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"},{"t":"path","d":"M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"}], "Hand"); // lucide: hand
export const Power = makeLucide([{"t":"path","d":"M12 2v10"},{"t":"path","d":"M18.4 6.6a9 9 0 1 1-12.77.04"}], "Power"); // lucide: power
export const Rocket = makeLucide([{"t":"path","d":"M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"},{"t":"path","d":"M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09"},{"t":"path","d":"M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z"},{"t":"path","d":"M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05"}], "Rocket"); // lucide: rocket

/* ----- Figma "hand-picked" set: glyphs the design uses that the app lacked ----- */
export const SquareActivity = makeLucide([{"t":"rect","width":"18","height":"18","x":"3","y":"3"},{"t":"path","d":"M17 12h-2l-2 5-2-10-2 5H7"}], "SquareActivity"); // lucide: square-activity
export const PcCase = makeLucide([{"t":"rect","width":"14","height":"20","x":"5","y":"2"},{"t":"path","d":"M15 14h.01"},{"t":"path","d":"M9 6h6"},{"t":"path","d":"M9 10h6"}], "PcCase"); // lucide: pc-case
export const ShieldX = makeLucide([{"t":"path","d":"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"},{"t":"path","d":"m14.5 9.5-5 5"},{"t":"path","d":"m9.5 9.5 5 5"}], "ShieldX"); // lucide: shield-x
export const Building2 = makeLucide([{"t":"path","d":"M10 12h4"},{"t":"path","d":"M10 8h4"},{"t":"path","d":"M14 21v-3a2 2 0 0 0-4 0v3"},{"t":"path","d":"M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2"},{"t":"path","d":"M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"}], "Building2"); // lucide: building-2
export const ChevronsRight = makeLucide([{"t":"path","d":"m6 17 5-5-5-5"},{"t":"path","d":"m13 17 5-5-5-5"}], "ChevronsRight"); // lucide: chevrons-right
export const Bug = makeLucide([{"t":"path","d":"M12 20v-9"},{"t":"path","d":"M14 7a4 4 0 0 1 4 4v3a6 6 0 0 1-12 0v-3a4 4 0 0 1 4-4z"},{"t":"path","d":"M14.12 3.88 16 2"},{"t":"path","d":"M21 21a4 4 0 0 0-3.81-4"},{"t":"path","d":"M21 5a4 4 0 0 1-3.55 3.97"},{"t":"path","d":"M22 13h-4"},{"t":"path","d":"M3 21a4 4 0 0 1 3.81-4"},{"t":"path","d":"M3 5a4 4 0 0 0 3.55 3.97"},{"t":"path","d":"M6 13H2"},{"t":"path","d":"m8 2 1.88 1.88"},{"t":"path","d":"M9 7.13V6a3 3 0 1 1 6 0v1.13"}], "Bug"); // lucide: bug
export const Presentation = makeLucide([{"t":"path","d":"M2 3h20"},{"t":"path","d":"M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"},{"t":"path","d":"m7 21 5-5 5 5"}], "Presentation"); // lucide: presentation
export const Clipboard = makeLucide([{"t":"rect","width":"8","height":"4","x":"8","y":"2"},{"t":"path","d":"M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"}], "Clipboard"); // lucide: clipboard
export const DatabaseArrowDown = makeLucide([{"t":"path","d":"m16 19 3 3 3-3"},{"t":"path","d":"M19 16v6"},{"t":"path","d":"M21 12.536V5"},{"t":"path","d":"M3 12A9 3 0 0 0 15.182 14.806"},{"t":"path","d":"M3 5V19A9 3 0 0 0 13.318 21.968"}], "DatabaseArrowDown"); // lucide: database-arrow-down

/* ----- custom straight glyph (no Lucide equivalent) ----- */
/** Three host towers side by side = a cluster. */
export const Cluster = makeSvg(
  "Cluster",
  [3.5, 10, 16.5].flatMap((x, i) => [
    createElement("rect", { key: `c${i}`, x, y: 5, width: 4, height: 14 }),
    createElement("line", { key: `v${i}`, x1: x + 1, y1: 8.2, x2: x + 3, y2: 8.2 }),
  ]),
);

/* ----- composed marks lifted from the Figma icon sheet ----- */
/** A circle struck through, the slash rising left-to-right.
 *  Figma: `Status/Failed` — geometry exported from the file, not redrawn. */
export const CircleSlash = makeSvg(
  "CircleSlash",
  els([
    ["path", { d: "M20.1 12C20.1 7.53 16.47 3.9 12 3.9C7.53 3.9 3.9 7.53 3.9 12C3.9 16.47 7.53 20.1 12 20.1C16.47 20.1 20.1 16.47 20.1 12Z" }],
    ["path", { d: "M17.53 6.47L6.47 17.53" }],
  ]),
);

/** An eight-point chamfered seal around a check — the angular
 *  counterpart to Lucide's rounded `badge-check`.
 *  Figma: `Feature/Compliance` — geometry exported from the file, not redrawn. */
export const SealCheck = makeSvg(
  "SealCheck",
  els([
    ["path", { d: "M18.46 14.67L21.15 12L18.46 9.33V5.54H14.69L12 2.85L9.33 5.54H5.54V9.33L2.85 12L5.54 14.67V18.46H9.33L12 21.15L14.69 18.46H18.46V14.67Z" }],
    ["path", { d: "M14.51 10.75L11.41 13.86L9.54 11.99" }],
  ]),
);

/** A speedometer: domed dial on a flat base, three ticks, hub and needle.
 *  Figma: `Feature/Throughput` — geometry exported from the file, not redrawn. */
export const Throughput = makeSvg(
  "Throughput",
  els([
    ["path", { d: "M22.41 14.31C22.41 16.45 21.76 18.45 20.65 20.1H3.35C2.24 18.45 1.59 16.45 1.59 14.31C1.59 8.56 6.25 3.9 12 3.9C17.75 3.9 22.41 8.56 22.41 14.31Z", strokeLinecap: "butt" }],
    ["path", { d: "M12 4.37V6.24" }],
    ["path", { d: "M20.09 14.32H22.19" }],
    ["path", { d: "M2.04 14.32H3.91" }],
    ["path", { d: "M13.63 11.53C14.54 12.44 14.54 13.89 13.63 14.8C12.73 15.7 11.27 15.7 10.37 14.8C9.46 13.89 9.46 12.44 10.37 11.53C11.27 10.63 12.73 10.63 13.63 11.53Z" }],
    ["path", { d: "M15.94 9.22L13.63 11.53" }],
  ]),
);

/** A crate opened at the top-right for a cloud. Figma hands the crate over
 *  as an outline rather than a centre line, so it is filled and given a hairline
 *  stroke that brings it back to the 1.8 weight its neighbours are drawn at.
 *  Figma: `Object/VM cloud` — geometry exported from the file, not redrawn. */
export const BoxCloud = makeSvg(
  "BoxCloud",
  els([
    ["path", { d: "M12.36 3.24L13.89 4.1C13.57 4.48 13.33 4.93 13.17 5.41L11.99 4.76L6.02 8.09L11.99 11.55L12.74 11.12C13.23 11.47 13.84 11.67 14.49 11.67H14.78L12.74 12.85V18.82L18.54 15.6V11.67H20.04V16.48L19.65 16.7L12.36 20.76L11.99 20.96L11.63 20.76L4.35 16.7L3.97 16.48V7.52L4.35 7.3L11.63 3.24L11.99 3.04L12.36 3.24ZM5.47 15.6L11.24 18.82V12.85L5.47 9.5V15.6Z", fill: "currentColor", strokeWidth: 0.3 }],
    ["path", { d: "M14.76 9.91H19.3C20.41 9.91 21.32 9.05 21.39 7.94C21.45 6.84 20.64 5.86 19.54 5.74C19.21 4.58 18.06 3.82 16.85 4C15.65 4.17 14.76 5.2 14.76 6.42C13.79 6.42 13.01 7.2 13.01 8.17C13.01 9.13 13.79 9.91 14.76 9.91Z" }],
  ]),
);

/** A store cut away on the right for a padlock.
 *  Figma: `Object/Immutable storage` — geometry exported from the file, not redrawn. */
export const DatabaseLock = makeSvg(
  "DatabaseLock",
  els([
    ["path", { d: "M5.02 12C5.02 12.47 5.41 12.93 6.15 13.33C6.9 13.73 7.96 14.05 9.22 14.26" }],
    ["path", { d: "M20.14 9.73V6.73" }],
    ["path", { d: "M5.02 6.79V17.88C5.02 18.42 5.55 18.96 6.53 19.39C7.51 19.83 8.89 20.15 10.45 20.3" }],
    ["path", { d: "M12.58 8.64C16.76 8.64 20.14 7.51 20.14 6.12C20.14 4.73 16.76 3.6 12.58 3.6C8.4 3.6 5.02 4.73 5.02 6.12C5.02 7.51 8.4 8.64 12.58 8.64Z" }],
    ["path", { d: "M20.14 20.3H13.42V14.7H20.14V20.3Z" }],
    ["path", { d: "M14.82 14.7V13.79C14.82 12.95 15.46 12.19 16.4 12.03C17.65 11.82 18.75 12.66 18.75 13.72V14.7" }],
  ]),
);

/** A cog wedged open by a play triangle. The cut ends are butt-capped, as
 *  in the file — square caps would grow them back over the wedge.
 *  Figma: `In-cell tag/Manual run` — geometry exported from the file, not redrawn. */
export const CogPlay = makeSvg(
  "CogPlay",
  els([
    ["path", { d: "M18.87 10.5L19.99 9.63L18.04 6.27L16.74 6.8C16 6.12 15.11 5.61 14.14 5.3L13.94 3.9H10.06L9.86 5.3C8.89 5.61 8 6.12 7.26 6.8L5.96 6.27L4.01 9.63L5.13 10.5C5.02 10.98 4.97 11.48 4.97 12C4.97 12.52 5.02 13.02 5.13 13.5L4.01 14.37L5.96 17.73L7.26 17.2C8 17.88 8.89 18.39 9.86 18.7L10.06 20.1H12", strokeLinecap: "butt" }],
    ["path", { d: "M12 14.8C10.45 14.8 9.2 13.55 9.2 12C9.2 10.45 10.45 9.2 12 9.2", strokeLinecap: "butt" }],
    ["path", { d: "M14.07 14.86L14.07 9.93L20.59 14.86L14.07 19.4L14.07 14.86Z" }],
  ]),
);

/** A store whose band is dashed — an incremental holds only the
 *  changed blocks. Butt caps throughout, or the sheet's square caps would close
 *  the dashes' gaps and read as solid. The band itself is an outline (see BoxCloud).
 *  Figma: `In-cell tag/Incremental` — geometry exported from the file, not redrawn. */
export const DatabaseDashed = makeSvg(
  "DatabaseDashed",
  els([
    ["path", { d: "M4.55 12.62V17.85C4.55 18.51 5.33 19.14 6.73 19.61C8.13 20.07 10.02 20.34 12 20.34C13.98 20.34 15.87 20.07 17.27 19.61C18.67 19.14 19.45 18.51 19.45 17.85V12.62", strokeLinecap: "butt", strokeLinejoin: "round" }],
    ["path", { d: "M12 9.1C16.12 9.1 19.45 7.89 19.45 6.38C19.45 4.88 16.12 3.66 12 3.66C7.88 3.66 4.55 4.88 4.55 6.38C4.55 7.89 7.88 9.1 12 9.1Z", strokeDasharray: "2.4 1.2", strokeLinecap: "butt" }],
    ["path", { d: "M4.55 8.92V11.42", strokeLinecap: "butt" }],
    ["path", { d: "M19.45 8.92V11.42", strokeLinecap: "butt" }],
    ["path", { d: "M13.46 14.48L13.51 15.23C13.04 15.26 12.55 15.28 12.06 15.28C11.56 15.28 11.07 15.26 10.6 15.23L10.65 14.48L10.7 13.73C11.14 13.76 11.59 13.78 12.06 13.78C12.52 13.78 12.97 13.76 13.41 13.73L13.46 14.48ZM6.82 12.94C7.5 13.21 8.37 13.44 9.36 13.59L9.26 14.33L9.15 15.07C8.06 14.91 7.07 14.66 6.26 14.33L6.54 13.64L6.82 12.94ZM17.57 13.64L17.85 14.33C17.04 14.66 16.05 14.91 14.97 15.07L14.86 14.33L14.75 13.59C15.75 13.44 16.61 13.21 17.29 12.94L17.57 13.64Z", fill: "currentColor", strokeWidth: 0.3, strokeLinecap: "butt" }],
  ]),
);

/** An open folder with a bar across the front panel.
 *  Figma: `Sidebar/Inventory` — geometry exported from the file, not redrawn. */
export const FolderOpenMinus = makeSvg(
  "FolderOpenMinus",
  els([
    ["path", { d: "M20.51 20.1H3.51C3.25 17.13 2.98 14.15 2.74 11.18H21.26L20.51 20.1Z" }],
    ["path", { d: "M5.11 11.18V3.9H10.63L12.66 6.66H18.9V11.18" }],
    ["path", { d: "M9.92 16.04H14.09" }],
  ]),
);

/** A presentation board carrying a trend line.
 *  Figma: `Sidebar/Reports` — geometry exported from the file, not redrawn. */
export const PresentationChart = makeSvg(
  "PresentationChart",
  els([
    ["path", { d: "M19.45 3.71H4.54V16.14H19.45V3.71Z" }],
    ["path", { d: "M3.42 3.71L20.58 3.71" }],
    ["path", { d: "M8.68 20.29L11.99 18.63V16.14" }],
    ["path", { d: "M15.31 20.29L11.99 18.63" }],
    ["path", { d: "M8.26 11.17L11.25 8.69L12.74 11.17L15.72 8.69" }],
  ]),
);

/** A clipboard with two ruled lines — a log page.
 *  Figma: `Sidebar/Logs` — geometry exported from the file, not redrawn. */
export const ClipboardLines = makeSvg(
  "ClipboardLines",
  els([
    ["path", { d: "M19.2 5.72V20.1H4.8V5.72H8.76V7.34H15.24V5.72H19.2Z" }],
    ["path", { d: "M15.24 3.9H8.76V7.34H15.24V3.9Z" }],
    ["path", { d: "M8.76 12.1H12" }],
    ["path", { d: "M8.76 15.34H15.24" }],
  ]),
);

/* ----- Dashboard glyph set (design-provided 20×20 paths) -----
   These four came with the production dashboard and have no Lucide
   equivalent at the same optical weight, so they survive the icon-set
   swap unchanged. */
/** The 20×20 frame those design-provided paths were drawn on. */
const BASE20 = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 20 20",
  fill: "none",
};

function makeGlyph(els: El[], displayName: string): LucideIcon {
  const Comp = forwardRef<SVGSVGElement, AppIconProps>((props, ref) => {
    const { size, color, strokeWidth, className, ...rest } = props;
    return createElement(
      "svg",
      {
        ref,
        ...BASE20,
        width: size ?? 24,
        height: size ?? 24,
        stroke: color ?? "currentColor",
        strokeWidth: strokeWidth ?? 1.25,
        className: className ? `shrink-0 ${className}` : "shrink-0",
        ...rest,
      },
      ...els.map(({ t, ...attrs }, i) => createElement(t, { key: i, ...attrs })),
    );
  });
  Comp.displayName = displayName;
  return Comp;
}

export const IconProtected = makeGlyph([
  {"t":"path","d":"M12.4348 15.7174L9.99992 16.75L7.56499 15.7174C5.68822 14.9221 4.41843 13.143 4.27192 11.1127L3.89517 5.88702C5.63176 5.12481 9.99992 3.25 9.99992 3.25C9.99992 3.25 14.576 5.19878 16.1047 5.88004L15.7279 11.1057C15.5814 13.136 14.3116 14.9221 12.4348 15.7174Z","strokeMiterlimit":"10","strokeLinecap":"square"},
  {"t":"path","d":"M7.96265 9.96856L9.34408 11.3639L12.0371 8.64993","strokeMiterlimit":"10","strokeLinecap":"square"},
], "IconProtected");

export const IconOk = makeGlyph([
  {"t":"path","d":"M16.7501 10C16.7501 6.27208 13.728 3.25 10.0001 3.25C6.27216 3.25 3.25009 6.27208 3.25009 10C3.25009 13.7279 6.27216 16.75 10.0001 16.75C13.728 16.75 16.7501 13.7279 16.7501 10Z","strokeLinecap":"square"},
  {"t":"path","d":"M7.13119 10L9.04817 11.9103L12.8687 8.08301","strokeLinecap":"square"},
], "IconOk");

export const IconBackup = makeGlyph([
  {"t":"path","d":"M3.35 10C3.34899 10.3914 3.67616 10.7751 4.2946 11.1078C4.91304 11.4406 5.79813 11.709 6.85 11.883","strokeLinecap":"square"},
  {"t":"path","d":"M15.95 8.11V5.60571","strokeLinecap":"square"},
  {"t":"path","d":"M3.35 5.65627L3.35 14.9C3.34956 15.3541 3.79067 15.796 4.6072 16.1594C5.42373 16.5229 6.5717 16.7884 7.879 16.916","strokeLinecap":"square"},
  {"t":"path","d":"M9.65 10V12.8H12.45","strokeLinecap":"square"},
  {"t":"path","d":"M10.35 15.6C10.7908 16.1877 11.4052 16.6218 12.1064 16.8408C12.8076 17.0598 13.5599 17.0527 14.2568 16.8204C14.9537 16.5881 15.5598 16.1424 15.9893 15.5465C16.4189 14.9506 16.65 14.2346 16.65 13.5C16.65 12.6646 16.3181 11.8634 15.7274 11.2726C15.1366 10.6819 14.3354 10.35 13.5 10.35C12.569 10.35 11.722 10.728 11.113 11.337L9.99911 12.5234","strokeLinecap":"square"},
  {"t":"path","d":"M9.65 7.2C13.1294 7.2 15.95 6.2598 15.95 5.1C15.95 3.9402 13.1294 3 9.65 3C6.1706 3 3.35 3.9402 3.35 5.1C3.35 6.2598 6.1706 7.2 9.65 7.2Z","strokeLinecap":"square"},
], "IconBackup");

export const IconActivity = makeGlyph([
  {"t":"path","d":"M16.75 16.75H3.24998V3.24998H16.75V16.75Z","strokeLinecap":"square"},
  {"t":"path","d":"M5.49773 9.99991H6.99621L8.49473 7.00291L11.4917 13.0037L13.1117 10.0067H14.4955","strokeLinecap":"square"},
], "IconActivity");


/* ----- OS brand logos (react-icons / Font Awesome brands), for VM glyphs ----- */
export { FaWindows as WindowsLogo, FaLinux as LinuxLogo } from "react-icons/fa6";

/* ----- Virtualization platform logos (Simple Icons), for hosts & clusters -----
   VMware uses a custom "boxes" glyph (see lib/platform-glyphs); Hyper-V reuses
   the Windows mark (WindowsLogo above). */
export { SiProxmox as ProxmoxLogo } from "react-icons/si";
