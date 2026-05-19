import { useEffect, useRef, useState } from 'react';

export function useWebSocketDisplay(url) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('connecting'); // connecting, connected, reconnecting, disconnected
  const [error, setError] = useState('');
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 10;
  const baseReconnectDelay = 2000; // 2 seconds

  useEffect(() => {
    let isMounted = true;

    function connectWebSocket() {
      try {
        // Construct WebSocket URL
        const wsUrl = url.replace(/^http/, 'ws');
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          if (!isMounted) return;
          console.log('WebSocket connected');
          setStatus('connected');
          setError('');
          reconnectAttemptsRef.current = 0;

          // Send initial heartbeat
          ws.send(JSON.stringify({ type: 'ping', timestamp: new Date().toISOString() }));
        };

        ws.onmessage = (event) => {
          if (!isMounted) return;

          try {
            const message = JSON.parse(event.data);

            // Handle heartbeat responses
            if (message.type === 'pong') {
              return;
            }

            // Handle turbulence alerts
            if (message.type === 'turbulence_alert') {
              setData(message);
              setStatus('connected');
              setError('');
            }
          } catch (e) {
            console.error('Failed to parse WebSocket message:', e);
          }
        };

        ws.onerror = (event) => {
          if (!isMounted) return;
          console.error('WebSocket error:', event);
          setError('Connection error. Reconnecting...');
          setStatus('reconnecting');
        };

        ws.onclose = () => {
          if (!isMounted) return;
          console.log('WebSocket disconnected');
          setStatus('reconnecting');

          // Attempt to reconnect with exponential backoff
          if (reconnectAttemptsRef.current < maxReconnectAttempts) {
            const delay = baseReconnectDelay * Math.pow(2, reconnectAttemptsRef.current);
            reconnectTimeoutRef.current = setTimeout(() => {
              if (isMounted) {
                reconnectAttemptsRef.current += 1;
                connectWebSocket();
              }
            }, delay);
          } else {
            setStatus('disconnected');
            setError('Connection lost. Please refresh the page.');
          }
        };

        wsRef.current = ws;
      } catch (e) {
        console.error('WebSocket connection error:', e);
        setError('Failed to connect. Retrying...');
        setStatus('reconnecting');

        // Retry after delay
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = baseReconnectDelay * Math.pow(2, reconnectAttemptsRef.current);
          reconnectTimeoutRef.current = setTimeout(() => {
            if (isMounted) {
              reconnectAttemptsRef.current += 1;
              connectWebSocket();
            }
          }, delay);
        }
      }
    }

    connectWebSocket();

    return () => {
      isMounted = false;

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounted');
      }
    };
  }, [url]);

  return { data, status, error };
}
