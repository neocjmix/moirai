// @ts-nocheck -- Next.js adapter: preserve copied URDR source under Moirai's stricter TS config.
import { Component, type ReactNode } from "react";

type RuntimeErrorBoundaryProps = {
  children: ReactNode;
  fallback: (args: { error: Error | null; reset: () => void }) => ReactNode;
  onError?: (error: Error, info: string) => void;
  resetKeys?: unknown[];
};

type RuntimeErrorBoundaryState = {
  error: Error | null;
};

export class RuntimeErrorBoundary extends Component<RuntimeErrorBoundaryProps, RuntimeErrorBoundaryState> {
  state: RuntimeErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): RuntimeErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    this.props.onError?.(error, info.componentStack);
  }

  componentDidUpdate(prevProps: RuntimeErrorBoundaryProps) {
    if (this.state.error === null) {
      return;
    }

    const currentResetKeys = this.props.resetKeys ?? [];
    const previousResetKeys = prevProps.resetKeys ?? [];
    if (currentResetKeys.length !== previousResetKeys.length) {
      this.reset();
      return;
    }

    for (let index = 0; index < currentResetKeys.length; index += 1) {
      if (!Object.is(currentResetKeys[index], previousResetKeys[index])) {
        this.reset();
        return;
      }
    }
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return this.props.fallback({ error: this.state.error, reset: this.reset });
    }

    return this.props.children;
  }
}
