(function () {
  "use strict";

  const config = window.__BETTER_GATEWAY_CONFIG__ || {
    reconnectIntervalMs: 3000,
    maxReconnectAttempts: 10,
  };

  let reconnectAttempts = 0;
  let statusIndicator = null;
  let originalWebSocket = window.WebSocket;
  let activeConnections = new Set();
  let currentState = "connected";
  let ideTabInjected = false;

  function createStatusIndicator() {
    if (statusIndicator) return statusIndicator;

    statusIndicator = document.createElement("div");
    statusIndicator.id = "better-gateway-status";
    statusIndicator.style.cssText = `
      position: fixed;
      bottom: 12px;
      left: 12px;
      padding: 8px 14px;
      border-radius: 6px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      font-weight: 500;
      z-index: 999999;
      transition: all 0.3s ease;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      cursor: pointer;
      user-select: none;
    `;

    // Click handler - always refresh the page
    statusIndicator.addEventListener("click", function () {
      window.location.reload();
    });

    // Hover effect
    statusIndicator.addEventListener("mouseenter", function () {
      statusIndicator.style.transform = "scale(1.05)";
      statusIndicator.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.25)";
    });
    statusIndicator.addEventListener("mouseleave", function () {
      statusIndicator.style.transform = "scale(1)";
      statusIndicator.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.15)";
    });

    document.body.appendChild(statusIndicator);
    return statusIndicator;
  }

  function updateStatus(state, message) {
    currentState = state;
    const indicator = createStatusIndicator();

    const styles = {
      connected: {
        background: "#10b981",
        color: "#ffffff",
        icon: "●",
      },
      disconnected: {
        background: "#ef4444",
        color: "#ffffff",
        icon: "●",
        clickHint: " (click to refresh)",
      },
      reconnecting: {
        background: "#f59e0b",
        color: "#ffffff",
        icon: "↻",
      },
      failed: {
        background: "#6b7280",
        color: "#ffffff",
        icon: "↻",
        clickHint: " (click to refresh)",
      },
    };

    const style = styles[state] || styles.disconnected;
    indicator.style.background = style.background;
    indicator.style.color = style.color;
    
    const displayMessage = message + (style.clickHint || "");
    indicator.innerHTML = `<span style="margin-right: 6px;">${style.icon}</span>${displayMessage}`;
    indicator.title = "Click to refresh page";

    if (state === "connected") {
      setTimeout(function () {
        indicator.style.opacity = "0.7";
      }, 2000);
    } else {
      indicator.style.opacity = "1";
    }
  }

  // ==================== IDE Sidebar Injection ====================

  function createIdeTab() {
    const tab = document.createElement("a");
    tab.id = "better-gateway-ide-tab";
    tab.href = "/better-gateway/ide";
    tab.className = "sidebar-item ide-tab";
    tab.title = "Open IDE - Code Editor";
    tab.innerHTML = `
      <span class="sidebar-icon">⚡</span>
      <span class="sidebar-label">IDE</span>
    `;
    
    tab.style.cssText = `
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 16px;
      color: #00d4ff;
      text-decoration: none;
      cursor: pointer;
      border-radius: 6px;
      margin: 4px 8px;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.2s ease;
      background: linear-gradient(135deg, rgba(0, 212, 255, 0.1) 0%, rgba(0, 212, 255, 0.05) 100%);
      border: 1px solid rgba(0, 212, 255, 0.2);
    `;

    tab.addEventListener("mouseenter", function () {
      tab.style.background = "linear-gradient(135deg, rgba(0, 212, 255, 0.2) 0%, rgba(0, 212, 255, 0.1) 100%)";
      tab.style.borderColor = "rgba(0, 212, 255, 0.4)";
      tab.style.transform = "translateX(2px)";
    });

    tab.addEventListener("mouseleave", function () {
      tab.style.background = "linear-gradient(135deg, rgba(0, 212, 255, 0.1) 0%, rgba(0, 212, 255, 0.05) 100%)";
      tab.style.borderColor = "rgba(0, 212, 255, 0.2)";
      tab.style.transform = "translateX(0)";
    });

    // Icon styling
    const icon = tab.querySelector(".sidebar-icon");
    if (icon) {
      icon.style.cssText = `
        font-size: 16px;
        width: 20px;
        text-align: center;
      `;
    }

    return tab;
  }

  function findSidebarContainer() {
    // Try various selectors that might match the gateway sidebar
    const selectors = [
      // Common sidebar patterns
      ".sidebar",
      ".sidebar-nav",
      ".side-nav",
      "[class*='sidebar']",
      "nav[class*='nav']",
      // Gateway-specific patterns
      ".app-sidebar",
      ".main-sidebar",
      "#sidebar",
      "aside",
      // Fallback - look for vertical nav structures
      "[role='navigation']",
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && isLikelySidebar(element)) {
        return element;
      }
    }

    // Last resort: find any nav-like vertical element
    const navs = document.querySelectorAll("nav, aside, [class*='nav']");
    for (const nav of navs) {
      if (isLikelySidebar(nav)) {
        return nav;
      }
    }

    return null;
  }

  function isLikelySidebar(element) {
    // Check if element looks like a sidebar
    if (!element) return false;
    
    try {
      const style = window.getComputedStyle(element);
      const isVisible = style.display !== "none" && style.visibility !== "hidden";
      
      // If we can get bounding rect, use it for more precise detection
      if (typeof element.getBoundingClientRect === "function") {
        const rect = element.getBoundingClientRect();
        // Sidebar characteristics:
        // - Usually on the left side of the page
        // - Relatively narrow (< 400px)
        // - Has some height
        const isLeftSide = rect.left < (window.innerWidth || 1024) / 2;
        const isNarrow = rect.width < 400 || rect.width === 0; // 0 in jsdom
        const hasSomeHeight = rect.height > 50 || rect.height === 0; // 0 in jsdom
        
        return isVisible && (rect.width === 0 || (isLeftSide && isNarrow && hasSomeHeight));
      }
      
      // Fallback: just check visibility
      return isVisible;
    } catch (e) {
      // If any error, assume it's a sidebar if it exists
      return true;
    }
  }

  function injectIdeTab() {
    if (ideTabInjected) return false;
    
    // Don't inject on the IDE page itself
    if (window.location.pathname === "/better-gateway/ide") {
      return false;
    }

    const sidebar = findSidebarContainer();
    if (!sidebar) {
      return false;
    }

    // Check if already injected
    if (document.getElementById("better-gateway-ide-tab")) {
      ideTabInjected = true;
      return false;
    }

    const ideTab = createIdeTab();
    
    // Try to find a good insertion point
    // Look for existing nav items to insert after, or append to end
    const existingItems = sidebar.querySelectorAll("a, button, [class*='item'], [class*='link']");
    
    if (existingItems.length > 0) {
      // Insert after the last item
      const lastItem = existingItems[existingItems.length - 1];
      // Create a separator if there are other items
      const separator = document.createElement("div");
      separator.className = "better-gateway-separator";
      separator.style.cssText = `
        height: 1px;
        background: rgba(255, 255, 255, 0.1);
        margin: 8px 16px;
      `;
      
      if (lastItem.parentNode === sidebar) {
        sidebar.appendChild(separator);
        sidebar.appendChild(ideTab);
      } else {
        // Items might be nested, try to find the right container
        const container = lastItem.closest("ul, div, nav") || sidebar;
        container.appendChild(separator);
        container.appendChild(ideTab);
      }
    } else {
      sidebar.appendChild(ideTab);
    }

    ideTabInjected = true;
    console.log("[BetterGateway] IDE tab injected into sidebar");
    return true;
  }

  function tryInjectIdeTab() {
    // Try immediately
    if (injectIdeTab()) return;

    // Retry with MutationObserver for dynamic sidebars
    const observer = new MutationObserver(function (mutations, obs) {
      if (injectIdeTab()) {
        obs.disconnect();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Give up after 10 seconds
    setTimeout(function () {
      observer.disconnect();
    }, 10000);
  }

  function wrapWebSocket(OriginalWebSocket) {
    function BetterWebSocket(url, protocols) {
      const ws = new OriginalWebSocket(url, protocols);
      const wrappedWs = ws;

      activeConnections.add(wrappedWs);

      ws.addEventListener("open", function () {
        reconnectAttempts = 0;
        updateStatus("connected", "Connected");
      });

      ws.addEventListener("close", function (event) {
        activeConnections.delete(wrappedWs);

        if (!event.wasClean && reconnectAttempts < config.maxReconnectAttempts) {
          reconnectAttempts++;
          updateStatus(
            "reconnecting",
            "Reconnecting (" + reconnectAttempts + "/" + config.maxReconnectAttempts + ")..."
          );

          setTimeout(function () {
            try {
              new BetterWebSocket(url, protocols);
            } catch (e) {
              console.error("[BetterGateway] Reconnection failed:", e);
            }
          }, config.reconnectIntervalMs);
        } else if (reconnectAttempts >= config.maxReconnectAttempts) {
          updateStatus("failed", "Connection failed");
        } else {
          updateStatus("disconnected", "Disconnected");
        }
      });

      ws.addEventListener("error", function () {
        updateStatus("disconnected", "Connection error");
      });

      return ws;
    }

    BetterWebSocket.prototype = OriginalWebSocket.prototype;
    BetterWebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
    BetterWebSocket.OPEN = OriginalWebSocket.OPEN;
    BetterWebSocket.CLOSING = OriginalWebSocket.CLOSING;
    BetterWebSocket.CLOSED = OriginalWebSocket.CLOSED;

    return BetterWebSocket;
  }

  window.WebSocket = wrapWebSocket(originalWebSocket);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      updateStatus("connected", "Ready");
      tryInjectIdeTab();
    });
  } else {
    updateStatus("connected", "Ready");
    tryInjectIdeTab();
  }

  window.addEventListener("online", function () {
    updateStatus("connected", "Back online");
  });

  window.addEventListener("offline", function () {
    updateStatus("disconnected", "Offline");
  });

  console.log("[BetterGateway] Auto-reconnect enabled", config);
})();
