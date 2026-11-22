import * as Linking from 'expo-linking';
import { Share } from 'react-native';
import { errorMessage } from '@/lib/api';
import { isJoinCode } from '@/lib/format';
import type { Group } from '@/lib/types';

// Opens the join screen with the code filled in (pennywise://join?code=… in builds, exp://…/--/join in Expo Go).
export const inviteLink = (code: string) => Linking.createURL('/join', { queryParams: { code } });

// The API adds people through join codes, so "Invite people" shares the group's code and link.
export function shareInvite(group: Pick<Group, 'name' | 'joinCode'>, notify: (message: string) => void) {
  void Share.share({ message: `Join ${group.name} on Pennywise with code ${group.joinCode}\n${inviteLink(group.joinCode)}` }).catch(error => notify(errorMessage(error)));
}

// Accepts a bare code or any link carrying ?code=; returns the normalized code or null.
export function codeFromScan(data: string): string | null {
  const text = data.trim();
  if (isJoinCode(text)) return text.toUpperCase();
  const match = /[?&]code=([^&#\s]+)/i.exec(text);
  const code = match ? decodeURIComponent(match[1]).toUpperCase() : '';
  return isJoinCode(code) ? code : null;
}
