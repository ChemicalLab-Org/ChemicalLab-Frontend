import { Injectable } from '@angular/core';
import { WhiteboardRealtimeConnection } from './whiteboard-realtime-connection';
export type { WhiteboardConnectionState } from './whiteboard-realtime-connection';

@Injectable({ providedIn: 'root' })
export class StudentWhiteboardRealtimeService extends WhiteboardRealtimeConnection {}
