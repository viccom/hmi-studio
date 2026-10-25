/// <reference types="vite/client" />

// T7 $rsiot 桥（lib/bridge.ts installBridge 注入；custom_code 一行调用面）
interface Window {
  $rsiot?: {
    send: (devid: string, tag: string, value: unknown) => Promise<void>
    nav: (target: string) => void
    back: () => void
    home: () => void
  }
}
