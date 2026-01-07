export enum CallStatus {
  IDLE = 'IDLE',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ENDED = 'ENDED',
  ERROR = 'ERROR'
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export type SignalType = 'HAND_TOGGLE' | 'KICK_PEER' | 'MUTE_REMOTE_REQ' | 'NAME_UPDATE';

export interface SignalMessage {
  type: SignalType;
  payload?: any;
}