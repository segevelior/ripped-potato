import './App.css'
import Pages from "@/pages/index.jsx"
import { Toaster } from "@/components/ui/toaster"
import { ThemeProvider } from "@/contexts/ThemeContext"
import ErrorBoundary from "@/components/ErrorBoundary"

function App() {
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <Pages />
      </ErrorBoundary>
      <Toaster />
    </ThemeProvider>
  )
}

export default App 