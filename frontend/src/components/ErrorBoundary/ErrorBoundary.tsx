import { Component, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // 生产环境可上报到 Sentry / 自研上报服务
    if (import.meta.env.PROD) {
      console.error('[ErrorBoundary]', error, errorInfo);
    }
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          role="alert"
          aria-live="assertive"
          className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-50 px-8"
        >
          <div
            className="w-16 h-16 rounded-full bg-red-500/15 border-2 border-red-500/40 flex items-center justify-center mb-6 text-3xl"
            aria-hidden="true"
          >
            ⚠️
          </div>
          <h1 className="text-2xl font-bold mb-2 text-slate-50">页面加载出错</h1>
          <p className="text-slate-400 text-sm mb-8 max-w-sm text-center leading-relaxed">
            抱歉，页面在加载过程中遇到了错误。你可以尝试刷新页面或返回首页。
          </p>
          <div className="flex gap-3">
            <Button onClick={this.handleReload} variant="default" size="default">
              刷新页面
            </Button>
            <Button onClick={this.handleGoHome} variant="outline" size="default">
              返回首页
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
