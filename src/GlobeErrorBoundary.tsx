import { Component, type ErrorInfo, type ReactNode } from 'react';

// Keep renderer failures inside the globe, not the page-level boundary.
export default class GlobeErrorBoundary extends Component<{
  children: ReactNode;
  onFailure: () => void;
}, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('SONARA 3D renderer failed:', error, info.componentStack);
    this.props.onFailure();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
