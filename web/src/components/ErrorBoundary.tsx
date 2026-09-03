import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** 自定义错误页标题 */
  title?: string
  /** 是否显示"返回首页"按钮 */
  showHomeLink?: boolean
  /** 错误时的回调（用于上报） */
  onError?: (error: Error, info: ErrorInfo) => void
}

interface State {
  hasError: boolean
  error?: Error
}

/**
 * 全局错误边界
 *
 * 捕获子组件树中未处理的渲染错误，防止整个应用白屏。
 * 错误发生时展示友好的错误提示页，并提供刷新和返回首页选项。
 *
 * 使用方式：
 *   <ErrorBoundary>
 *     <App />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 开发环境打印详细错误
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary] 组件渲染出错:', error)
      console.error('[ErrorBoundary] 组件栈:', info.componentStack)
    }
    this.props.onError?.(error, info)
  }

  handleReload = (): void => {
    window.location.reload()
  }

  handleGoHome = (): void => {
    window.location.href = '/'
  }

  render(): ReactNode {
    if (this.state.hasError) {
      const { title = '页面出错了', showHomeLink = true } = this.props

      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #4c1d95 100%)',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
        }}>
          <div style={{
            maxWidth: '480px',
            width: '100%',
            textAlign: 'center',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '20px',
            padding: '40px 32px',
            backdropFilter: 'blur(12px)',
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              margin: '0 auto 20px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #f59e0b, #ef4444, #8b5cf6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px',
              fontWeight: 'bold',
            }}>
              !
            </div>

            <h1 style={{
              fontSize: '24px',
              fontWeight: 700,
              color: '#f8fafc',
              margin: '0 0 12px',
            }}>
              {title}
            </h1>

            <p style={{
              color: '#94a3b8',
              lineHeight: 1.6,
              margin: '0 0 24px',
              fontSize: '14px',
            }}>
              很抱歉，页面在渲染过程中遇到了问题。
              您可以尝试刷新页面，或返回首页继续使用。
            </p>

            {import.meta.env.DEV && this.state.error && (
              <div style={{
                textAlign: 'left',
                background: 'rgba(0, 0, 0, 0.3)',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '20px',
                overflow: 'auto',
                maxHeight: '160px',
                fontSize: '12px',
                color: '#f87171',
                fontFamily: 'ui-monospace, Consolas, monospace',
              }}>
                {this.state.error.message}
              </div>
            )}

            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}>
              <button
                onClick={this.handleReload}
                style={{
                  padding: '10px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'opacity 0.2s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9' }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
              >
                刷新页面
              </button>

              {showHomeLink && (
                <button
                  onClick={this.handleGoHome}
                  style={{
                    padding: '10px 24px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    background: 'transparent',
                    color: '#e2e8f0',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  返回首页
                </button>
              )}
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
