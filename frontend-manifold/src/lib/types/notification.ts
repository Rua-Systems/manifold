export type NotificationKind = 'notice' | 'confirm' | 'fault';

export interface Notification {
	id: number;
	kind: NotificationKind;
	message: string;
}

export const NOTIFICATION_LABELS: Record<NotificationKind, string> = {
	notice: 'Notice',
	confirm: 'Confirmed',
	fault: 'Fault'
};
