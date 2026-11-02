import React from "react";

// Solid (filled) icons for the sidebar and dashboard, matching the design.
// All are drawn on a 24×24 grid and take the current text colour.
const base = (size, props) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": true, ...props });

export const HomeIcon = ({ size = 20, ...p }) => (
  <svg {...base(size, p)}><path d="M11.3 2.6a1 1 0 0 1 1.4 0l8.5 8a1 1 0 0 1-.7 1.7H19v7.2a1.8 1.8 0 0 1-1.8 1.8H14.5v-5.6a1 1 0 0 0-1-1h-3a1 1 0 0 0-1 1v5.6H6.8A1.8 1.8 0 0 1 5 19.5v-7.2H3.5a1 1 0 0 1-.7-1.7z" /></svg>
);
export const BudgetsIcon = ({ size = 20, ...p }) => (
  <svg {...base(size, p)}><rect x="3" y="3" width="8" height="8" rx="2.2" /><rect x="13" y="3" width="8" height="8" rx="2.2" /><rect x="3" y="13" width="8" height="8" rx="2.2" /><rect x="13" y="13" width="8" height="8" rx="2.2" /></svg>
);
export const TransactionsIcon = ({ size = 20, ...p }) => (
  <svg {...base(size, p)}><rect x="3" y="4" width="18" height="4.2" rx="2.1" /><rect x="3" y="9.9" width="13" height="4.2" rx="2.1" /><rect x="3" y="15.8" width="16" height="4.2" rx="2.1" /></svg>
);
export const GoalsIcon = ({ size = 20, ...p }) => (
  <svg {...base(size, p)}><path fillRule="evenodd" d="M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19Zm4.3 6.3a1.2 1.2 0 0 0-1.7 0l-3.8 3.8-1.4-1.4a1.2 1.2 0 1 0-1.7 1.7l2.2 2.2a1.2 1.2 0 0 0 1.7 0l4.7-4.6a1.2 1.2 0 0 0 0-1.7Z" /></svg>
);
export const AnalyticsIcon = ({ size = 20, ...p }) => (
  <svg {...base(size, p)}><rect x="3.5" y="12" width="4.4" height="9" rx="1.6" /><rect x="9.8" y="7.5" width="4.4" height="13.5" rx="1.6" /><rect x="16.1" y="3" width="4.4" height="18" rx="1.6" /></svg>
);
export const NotesIcon = ({ size = 20, ...p }) => (
  <svg {...base(size, p)}><path fillRule="evenodd" d="M6 3h9.2L21 8.8V18a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Zm9.9 6.4-5.7 5.7-.5 2.3 2.3-.5 5.7-5.7a1.3 1.3 0 0 0-1.8-1.8Z" /></svg>
);
export const AssistantIcon = ({ size = 20, ...p }) => (
  <svg {...base(size, p)}><path fillRule="evenodd" d="M12 3c5 0 9 3.4 9 7.7s-4 7.7-9 7.7c-.9 0-1.8-.1-2.6-.3L5.2 20.6a.8.8 0 0 1-1.2-.8l.6-3.2C3.6 15 3 13 3 10.7 3 6.4 7 3 12 3Zm-4 6.3a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8Zm4 0a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8Zm4 0a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8Z" /></svg>
);
export const SettingsIcon = ({ size = 20, ...p }) => (
  <svg {...base(size, p)}><path fillRule="evenodd" d="M10.3 2.6h3.4l.6 2.6c.6.2 1.2.5 1.7.9l2.5-.8 1.7 2.9-1.9 1.8c.1.6.1 1.3 0 1.9l1.9 1.8-1.7 2.9-2.5-.8c-.5.4-1.1.7-1.7.9l-.6 2.6h-3.4l-.6-2.6c-.6-.2-1.2-.5-1.7-.9l-2.5.8-1.7-2.9 1.9-1.8a7 7 0 0 1 0-1.9L3.8 8.2l1.7-2.9 2.5.8c.5-.4 1.1-.7 1.7-.9zM12 8.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4Z" /></svg>
);
export const MarketIcon = ({ size = 20, ...p }) => (
  <svg {...base(size, p)}><rect x="4" y="7" width="4.5" height="9" rx="1.3" /><rect x="5.6" y="3.5" width="1.3" height="17" rx=".65" /><rect x="15.5" y="9" width="4.5" height="7.5" rx="1.3" /><rect x="17.1" y="5.5" width="1.3" height="15" rx=".65" /><rect x="10" y="5" width="4" height="13" rx="1.3" opacity=".55" /></svg>
);
export const SparkleIcon = ({ size = 20, ...p }) => (
  <svg {...base(size, p)}><path d="M11 2.5c.3 0 .5.2.6.5l1.2 4.2a4 4 0 0 0 2.8 2.8l4.2 1.2c.6.2.6 1 0 1.2l-4.2 1.2a4 4 0 0 0-2.8 2.8l-1.2 4.2c-.2.6-1 .6-1.2 0l-1.2-4.2a4 4 0 0 0-2.8-2.8l-4.2-1.2c-.6-.2-.6-1 0-1.2l4.2-1.2a4 4 0 0 0 2.8-2.8L10.4 3c.1-.3.3-.5.6-.5Z" /><path d="M18.5 2.2c.2 0 .3.1.4.3l.4 1.3c.1.4.4.7.8.8l1.3.4c.4.1.4.6 0 .7l-1.3.4c-.4.1-.7.4-.8.8l-.4 1.3c-.1.4-.6.4-.7 0l-.4-1.3a1.2 1.2 0 0 0-.8-.8l-1.3-.4c-.4-.1-.4-.6 0-.7l1.3-.4c.4-.1.7-.4.8-.8l.4-1.3c0-.2.2-.3.3-.3Z" /></svg>
);
