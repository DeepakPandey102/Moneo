import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import "./styles/moneo.css";
import "./styles/themes.css";
import { applySavedSkin } from "./utils/theme";

applySavedSkin();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
