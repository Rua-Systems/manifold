export type NotificationKind = 'notice' | 'confirm' | 'fault';

export interface Notification {
	id: number;
	kind: NotificationKind;
	message: string;
}
