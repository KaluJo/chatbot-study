import { LogEntry } from './LogViewer';

// Define log reducer actions
export type LogAction = 
  | { type: 'ADD_LOG'; payload: LogEntry }
  | { type: 'CLEAR_LOGS' };

// Log reducer function
export function logReducer(state: LogEntry[], action: LogAction): LogEntry[] {
  switch (action.type) {
    case 'ADD_LOG':
      return [...state, action.payload];
    case 'CLEAR_LOGS':
      return [];
    default:
      return state;
  }
}

// Create a logger function factory with optional context for batch operations
export function createLogger(dispatch: React.Dispatch<LogAction>) {
  return (message: string, type: LogEntry['type'] = 'info', context?: string) => {
    // Add context prefix if provided (for batch operations)
    const formattedMessage = context ? `[${context}] ${message}` : message;
    
    // Log to console
    if (type === 'error') {
      console.error(formattedMessage);
    } else if (type === 'warning') {
      console.warn(formattedMessage);
    } else {
      console.log(formattedMessage);
    }
    
    // Add to logs state
    dispatch({
      type: 'ADD_LOG',
      payload: {
        message: formattedMessage,
        timestamp: new Date(),
        type
      }
    });
  };
}

// Helper to create a logger with a specific context
export function createContextLogger(baseLogger: (message: string, type: LogEntry['type'], context?: string) => void, context: string) {
  return (message: string, type: LogEntry['type'] = 'info') => {
    baseLogger(message, type, context);
  };
} 