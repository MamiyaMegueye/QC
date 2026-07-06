import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import "./styles/index.css"

class ErrorBoundary extends React.Component {
  state = { error: null, info: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) {
    console.error("REACT CRASH:", error, info)
    this.setState({ info })
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: 20,
          fontFamily: "monospace",
          background: "#fee",
          color: "#900",
          whiteSpace: "pre-wrap",
          fontSize: 13,
          lineHeight: 1.5,
        }}>
          <h2 style={{ marginTop: 0 }}>💥 Crash React</h2>
          <b>{this.state.error?.name}: {this.state.error?.message}</b>
          {"\n\n📍 Stack trace :\n"}
          {this.state.error?.stack}
          {"\n\n📍 Composant qui plante :\n"}
          {this.state.info?.componentStack}
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)