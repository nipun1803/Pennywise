import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator } from 'expo-image-manipulator';
import { ImageChoice } from '@/components/image-choice';
import { PhotoCrop } from '@/components/photo-crop';
import { Avatar, AvatarBadge } from '@/components/ui/app-ui';
import Profile from '@/app/(app)/profile';
import EditGroup from '@/app/(app)/group/[id]/settings';
import GroupOverview from '@/app/(app)/group/[id]/index';
import CreateGroup from '@/app/(app)/create-group';
import { request } from '@/lib/api';
import { router } from 'expo-router';

const mockUrl = 'https://res.cloudinary.com/test/image/upload/photo.jpg';
const mockDraft = 'data:image/jpeg;base64,/9j/';
const mockMutate = jest.fn(); const mockUpdateUser = jest.fn();
const mockResource = jest.fn();
const mockApp = { colors: require('../../src/theme/palette').palette.light, offline: false, session: { user: { id: 'member', name: 'Alice', email: 'a@example.com', avatarColor: 'rose', image: null } }, notify: jest.fn(), invalidate: jest.fn(), updateUser: mockUpdateUser, logout: jest.fn(), themeMode: 'system', setThemeMode: jest.fn() };
const mockGroup = { id: 'group', name: 'Weekend', description: 'Friends', image: null, color: 'violet', createdBy: 'creator' };
jest.mock('@/providers/app-provider', () => ({ useApp: () => mockApp }));
jest.mock('expo-router', () => ({ router: { canGoBack: () => true, back: jest.fn(), replace: jest.fn(), push: jest.fn() }, useLocalSearchParams: () => ({ id: 'group' }) }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@expo/vector-icons/Feather', () => 'Icon');
jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@/theme/illustrations', () => ({ illustrations: { squad: { source: 1, ratio: 1 }, crew: { source: 1, ratio: 1 } } }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn(), launchCameraAsync: jest.fn(), requestCameraPermissionsAsync: jest.fn() }));
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: { manipulate: jest.fn(() => ({ crop: jest.fn().mockReturnThis(), resize: jest.fn().mockReturnThis(), renderAsync: jest.fn(async () => ({ saveAsync: jest.fn(async options => ({ uri: 'file:///prepared.jpg', width: 1200, height: 800, ...(options.base64 ? { base64: '/9j/' } : {}) })) })) })) },
}));
jest.mock('@/lib/api', () => ({ request: jest.fn(), errorMessage: e => e.message }));
jest.mock('@/hooks/use-mutation', () => ({ useMutation: () => ({ busy: false, mutate: mockMutate }) }));
jest.mock('@/hooks/use-resource', () => ({ useResource: path => mockResource(path) }));

beforeEach(() => {
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.clearAllMocks(); mockApp.offline = false;
  mockApp.session.user = { id: 'member', name: 'Alice', email: 'a@example.com', avatarColor: 'rose', avatar: 'leaf', image: null };
  mockGroup.image = null; mockGroup.createdBy = 'creator';
  mockResource.mockImplementation(path => ({ data: path === '/groups/group' ? mockGroup : path?.includes('/statements') ? { overallBalanceCents: 0 } : path ? [] : null, reload: jest.fn() }));
  ImagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///picked.jpg', width: 1200, height: 800 }] });
  ImagePicker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///camera.jpg', width: 1200, height: 800 }] });
  ImagePicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
  request.mockReset().mockResolvedValue({ data: { image: mockUrl } });
  mockMutate.mockReset().mockImplementation(async (path, _method, body) => ({ data: { ...(path === '/me' ? mockApp.session.user : mockGroup), ...body } }));
  mockUpdateUser.mockReset().mockImplementation(async user => { mockApp.session.user = user; });
});
afterEach(() => jest.restoreAllMocks());

async function openPhotoMenu() {
  await fireEvent.press(screen.getByRole('button', { name: 'Change photo' }));
}
async function startCrop(button = 'Choose from gallery') {
  await openPhotoMenu();
  await fireEvent.press(screen.getByRole('button', { name: button }));
  await screen.findByText('Crop photo');
}
async function selectPhoto(button = 'Choose from gallery') {
  await startCrop(button);
  await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(screen.queryByText('Crop photo')).toBeNull());
}

test('group preset choices remain available alongside the camera/gallery menu', async () => {
  await render(<ImageChoice name="Alice" onChange={jest.fn()} />);
  expect(screen.queryByRole('button', { name: 'Take photo' })).toBeNull();
  expect(screen.getByText('Initials')).toBeTruthy(); expect(screen.getByText('Trip')).toBeTruthy();
  await openPhotoMenu();
  expect(screen.getByRole('button', { name: 'Take photo' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Choose from gallery' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Remove photo' }).props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
});
test('gallery cropping uses Done and creates only a local draft for a new group', async () => {
  const changed = jest.fn();
  await render(<ImageChoice name="Alice" onChange={changed} />);
  await selectPhoto();
  expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({ allowsEditing: false, mediaTypes: ['images'] }));
  expect(ImageManipulator.manipulate.mock.results[1].value.crop).toHaveBeenCalledWith({ originX: 200, originY: 0, width: 800, height: 800 });
  expect(changed).toHaveBeenCalledWith(mockDraft);
  expect(request).not.toHaveBeenCalled();
});
test('camera selection uses the same crop flow', async () => {
  const changed = jest.fn(); await render(<ImageChoice name="Weekend" onChange={changed} />);
  await selectPhoto('Take photo');
  expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(ImagePicker.launchCameraAsync).toHaveBeenCalledWith(expect.objectContaining({ allowsEditing: false }));
  expect(changed).toHaveBeenCalledWith(mockDraft);
});
test('iOS waits for the menu to dismiss before opening the native picker', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  await render(<ImageChoice name="Alice" onChange={jest.fn()} />);
  await openPhotoMenu();
  const onDismiss = screen.getByTestId('photo-menu').props.onDismiss;
  await fireEvent.press(screen.getByRole('button', { name: 'Choose from gallery' }));
  expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  await act(async () => { onDismiss(); });
  await screen.findByText('Crop photo');
  expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
});
test('denied camera permissions explain the alternative and never open the camera', async () => {
  ImagePicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: false });
  await render(<ImageChoice name="Alice" onChange={jest.fn()} />);
  await openPhotoMenu();
  await fireEvent.press(screen.getByRole('button', { name: 'Take photo' }));
  await screen.findByText(/Camera access is needed/);
  expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
});
test('canceling the picker or crop keeps the old photo and releases the form', async () => {
  const changed = jest.fn(); const busy = jest.fn();
  ImagePicker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: true, assets: null });
  await render(<ImageChoice name="Alice" value={mockUrl} onChange={changed} onBusy={busy} />);
  await openPhotoMenu();
  await fireEvent.press(screen.getByRole('button', { name: 'Choose from gallery' }));
  await waitFor(() => expect(busy).toHaveBeenLastCalledWith(false));
  await startCrop();
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(changed).not.toHaveBeenCalled(); expect(busy).toHaveBeenLastCalledWith(false);
});
test('profile Done uploads and saves immediately without saving draft name or changing color', async () => {
  await render(<Profile />);
  await fireEvent.changeText(screen.getByLabelText('Display name'), 'New name');
  await startCrop();
  expect(request).not.toHaveBeenCalled();
  expect(screen.queryByText('Use photo')).toBeNull();
  expect(screen.queryByText('Rose')).toBeNull();
  expect(screen.getByText('Leaf')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(mockUpdateUser).toHaveBeenCalled());
  expect(request).toHaveBeenCalledWith('/media/images', { method: 'POST', body: { image: mockDraft } });
  expect(mockMutate).toHaveBeenCalledWith('/me', 'PATCH', { avatar: 'initials', image: mockUrl });
  expect(mockUpdateUser).toHaveBeenCalledWith(expect.objectContaining({ name: 'Alice', avatarColor: 'rose', image: mockUrl }));
  await waitFor(() => expect(screen.getByLabelText('Display name').props.value).toBe('New name'));
  await fireEvent.press(screen.getByRole('button', { name: 'Save profile' }));
  await waitFor(() => expect(mockMutate).toHaveBeenLastCalledWith('/me', 'PATCH', { name: 'New name' }));
  expect(request).toHaveBeenCalledTimes(1);
});
test('upload errors retain the old photo and offer Retry without saving a local image', async () => {
  mockApp.session.user.image = 'https://example.com/old.jpg';
  request.mockRejectedValueOnce(new Error('Upload failed'));
  await render(<Profile />); await selectPhoto();
  await screen.findByText('Upload failed');
  expect(mockMutate).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Alice photo').props.source.uri).toBe('https://example.com/old.jpg');
  await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(mockUpdateUser).toHaveBeenCalled());
  expect(request).toHaveBeenCalledTimes(2);
});
test('a failed profile patch can retry without uploading the same photo twice', async () => {
  mockMutate.mockRejectedValueOnce(new Error('Save failed'));
  await render(<Profile />); await selectPhoto();
  await screen.findByText('Save failed');
  expect(mockUpdateUser).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(2));
  expect(request).toHaveBeenCalledTimes(1);
});
test('a non-creator can view group details but has no photo or preset editing controls', async () => {
  mockGroup.image = mockUrl;
  await render(<EditGroup />);
  expect(screen.getByLabelText('Group name').props.editable).toBe(false);
  expect(screen.getByLabelText('Description').props.editable).toBe(false);
  expect(screen.getByText(/Only the group creator can change the group photo/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Change photo' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Remove photo' })).toBeNull();
  expect(screen.queryByText('Trip')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
  expect(screen.getAllByLabelText('Weekend photo')[0].props.source.uri).toBe(mockUrl);
  expect(request).not.toHaveBeenCalled(); expect(mockMutate).not.toHaveBeenCalled();
});
test('the creator can use the camera and save only the group photo on Done', async () => {
  mockApp.session.user.id = 'creator';
  await render(<EditGroup />); await selectPhoto('Take photo');
  await waitFor(() => expect(mockMutate).toHaveBeenCalledWith('/groups/group', 'PATCH', { image: mockUrl }));
  expect(screen.getAllByLabelText('Weekend photo')[0].props.source.uri).toBe(mockUrl);
});
test('a creator’s pending group details survive a separate immediate photo save', async () => {
  mockApp.session.user.id = 'creator';
  await render(<EditGroup />);
  await fireEvent.changeText(screen.getByLabelText('Group name'), 'New group name');
  await fireEvent.changeText(screen.getByLabelText('Description'), 'New description');
  await selectPhoto();
  await waitFor(() => expect(mockMutate).toHaveBeenCalledWith('/groups/group', 'PATCH', { image: mockUrl }));
  expect(screen.getByLabelText('Group name').props.value).toBe('New group name');
  expect(screen.getByLabelText('Description').props.value).toBe('New description');
  await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(mockMutate).toHaveBeenLastCalledWith('/groups/group', 'PATCH', { name: 'New group name', description: 'New description' }));
  expect(request).toHaveBeenCalledTimes(1);
});
test('a failed group photo save leaves the old image and retries the patch only', async () => {
  mockApp.session.user.id = 'creator';
  mockGroup.image = 'https://example.com/old-group.jpg';
  mockMutate.mockRejectedValueOnce(new Error('Group save failed'));
  await render(<EditGroup />); await selectPhoto();
  await screen.findByText('Group save failed');
  expect(screen.getAllByLabelText('Weekend photo')[0].props.source.uri).toBe(mockGroup.image);
  await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(2));
  expect(request).toHaveBeenCalledTimes(1);
});
test('Remove photo saves immediately and can retry without any media upload', async () => {
  mockApp.session.user.image = mockUrl;
  mockMutate.mockRejectedValueOnce(new Error('Remove failed'));
  await render(<Profile />); await openPhotoMenu();
  await fireEvent.press(screen.getByRole('button', { name: 'Remove photo' }));
  await screen.findByText('Remove failed');
  expect(screen.getByLabelText('Alice photo').props.source.uri).toBe(mockUrl);
  await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledWith(expect.objectContaining({ image: null, avatar: 'initials' })));
  expect(mockMutate).toHaveBeenLastCalledWith('/me', 'PATCH', { image: null, avatar: 'initials' });
  expect(request).not.toHaveBeenCalled();
});
test('the creator can remove the group photo immediately', async () => {
  mockApp.session.user.id = 'creator';
  mockGroup.image = mockUrl;
  await render(<EditGroup />); await openPhotoMenu();
  await fireEvent.press(screen.getByRole('button', { name: 'Remove photo' }));
  await waitFor(() => expect(mockMutate).toHaveBeenCalledWith('/groups/group', 'PATCH', { image: null }));
  expect(request).not.toHaveBeenCalled();
});
test('saving shows progress and blocks duplicate photo changes and form submission', async () => {
  let finish;
  request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await render(<Profile />);
  await fireEvent.changeText(screen.getByLabelText('Display name'), 'New name');
  await selectPhoto();
  await screen.findByText('Saving photo…');
  expect(screen.getByRole('button', { name: 'Change photo' }).props.accessibilityState.busy).toBe(true);
  await fireEvent.press(screen.getByRole('button', { name: 'Change photo' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Save profile' }));
  expect(screen.queryByRole('button', { name: 'Take photo' })).toBeNull();
  expect(mockMutate).not.toHaveBeenCalled();
  await act(async () => { finish({ data: { image: mockUrl } }); });
  await waitFor(() => expect(mockUpdateUser).toHaveBeenCalled());
  expect(request).toHaveBeenCalledTimes(1);
});
test('offline prevents photo changes, and going offline during crop still permits Cancel', async () => {
  const changed = jest.fn();
  const view = await render(<ImageChoice name="Alice" onChange={changed} disabled />);
  await fireEvent.press(screen.getByRole('button', { name: 'Change photo' }));
  expect(screen.queryByRole('button', { name: 'Take photo' })).toBeNull();
  await view.rerender(<ImageChoice name="Alice" onChange={changed} />);
  await startCrop();
  await view.rerender(<ImageChoice name="Alice" onChange={changed} disabled />);
  await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
  expect(changed).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByText('Crop photo')).toBeNull();
});
test('group creation saves a chosen photo with the group details', async () => {
  request.mockImplementation(async path => ({ data: path === '/media/images' ? { image: mockUrl } : { id: 'group' } }));
  await render(<CreateGroup />);
  await fireEvent.changeText(screen.getByLabelText('Group name'), 'Trip');
  await selectPhoto();
  expect(request).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Create group' }));
  await waitFor(() => expect(request).toHaveBeenCalledWith('/groups', expect.objectContaining({ body: expect.objectContaining({ name: 'Trip', image: mockUrl }) })));
});
test('removing a new-group draft is local and does not create or upload anything', async () => {
  await render(<CreateGroup />); await selectPhoto();
  expect(screen.getByText(/It will save when you tap Create group/)).toBeTruthy();
  await openPhotoMenu(); await fireEvent.press(screen.getByRole('button', { name: 'Remove photo' }));
  expect(screen.queryByText(/Photo selected/)).toBeNull();
  expect(request).not.toHaveBeenCalled(); expect(mockMutate).not.toHaveBeenCalled();
});
test('stored preset icons and profile avatars render again while initials remain available', async () => {
  await render(<><Avatar name="Weekend" color="violet" image="preset:people" /><AvatarBadge name="Alice" color="rose" avatar="leaf" /><AvatarBadge name="Bob" avatar="initials" /></>);
  expect(screen.getByLabelText('Weekend preset avatar')).toBeTruthy(); expect(screen.getByLabelText('Alice leaf avatar')).toBeTruthy();
  expect(screen.getByText('BO')).toBeTruthy();
  expect(screen.queryByLabelText('Weekend photo')).toBeNull();
});
test('profile avatar choices are restored without the color picker', async () => {
  await render(<Profile />);
  for (const label of ['Initials', 'Leaf', 'Sun', 'Sparkles', 'Coffee']) expect(screen.getByText(label)).toBeTruthy();
  expect(screen.getByLabelText('Alice leaf avatar')).toBeTruthy();
  expect(screen.queryByText('Rose')).toBeNull(); expect(screen.queryByText('Emerald')).toBeNull();
});
test('profile avatar selection clears the photo and saves without uploading or touching draft name/color', async () => {
  mockApp.session.user.image = mockUrl;
  await render(<Profile />);
  await fireEvent.changeText(screen.getByLabelText('Display name'), 'Pending name');
  await fireEvent.press(screen.getByText('Sun'));
  await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledWith(expect.objectContaining({ name: 'Alice', avatar: 'sun', avatarColor: 'rose', image: null })));
  expect(mockMutate).toHaveBeenCalledWith('/me', 'PATCH', { avatar: 'sun', image: null });
  expect(request).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Pending name sun avatar')).toBeTruthy();
  expect(screen.getByLabelText('Display name').props.value).toBe('Pending name');
  await fireEvent.press(screen.getByRole('button', { name: 'Save profile' }));
  await waitFor(() => expect(mockMutate).toHaveBeenLastCalledWith('/me', 'PATCH', { name: 'Pending name' }));
});
test('failed avatar selection keeps the photo and retries the same avatar without an upload', async () => {
  mockApp.session.user.image = mockUrl;
  mockMutate.mockRejectedValueOnce(new Error('Avatar save failed'));
  await render(<Profile />); await fireEvent.press(screen.getByText('Coffee'));
  await screen.findByText('Avatar save failed');
  expect(screen.getByLabelText('Alice photo').props.source.uri).toBe(mockUrl);
  await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledWith(expect.objectContaining({ avatar: 'coffee', image: null })));
  expect(mockMutate).toHaveBeenCalledTimes(2); expect(request).not.toHaveBeenCalled();
});
test('switching from a failed upload to a preset clears the stale photo retry', async () => {
  request.mockRejectedValueOnce(new Error('Storage configuration rejected'));
  await render(<Profile />); await selectPhoto();
  await screen.findByText('Storage configuration rejected');
  await fireEvent.press(screen.getByText('Leaf'));
  await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledWith(expect.objectContaining({ avatar: 'leaf', image: null })));
  expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull(); expect(request).toHaveBeenCalledTimes(1);
});
test('the creator can save a group preset without uploading or changing draft details', async () => {
  mockApp.session.user.id = 'creator';
  await render(<EditGroup />); await fireEvent.press(screen.getByText('Trip'));
  await waitFor(() => expect(mockMutate).toHaveBeenCalledWith('/groups/group', 'PATCH', { image: 'preset:airplane' }));
  expect(screen.getAllByLabelText('Weekend preset avatar')).toHaveLength(2);
  expect(request).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Save changes' }).props.accessibilityState.disabled).toBe(true);
});
test('a non-creator sees a stored group preset but cannot replace it', async () => {
  mockGroup.image = 'preset:heart';
  await render(<EditGroup />);
  expect(screen.getAllByLabelText('Weekend preset avatar')).toHaveLength(2);
  expect(screen.queryByText('Family')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Change photo' })).toBeNull();
  expect(mockMutate).not.toHaveBeenCalled();
});
test('only the creator gets the Change group photo shortcut on the group overview', async () => {
  const view = await render(<GroupOverview />);
  expect(screen.queryByRole('button', { name: 'Change group photo' })).toBeNull();
  mockApp.session.user.id = 'creator'; await view.rerender(<GroupOverview />);
  await fireEvent.press(screen.getByRole('button', { name: 'Change group photo' }));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/group/[id]/settings', params: { id: 'group' } });
});
test('a new-group preset remains local until Create group and needs no upload', async () => {
  await render(<CreateGroup />);
  await fireEvent.changeText(screen.getByLabelText('Group name'), 'Family group');
  await fireEvent.press(screen.getByText('Family'));
  expect(request).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Create group' }));
  await waitFor(() => expect(request).toHaveBeenCalledWith('/groups', expect.objectContaining({ body: expect.objectContaining({ name: 'Family group', image: 'preset:heart' }) })));
  expect(request).toHaveBeenCalledTimes(1);
});
test('avatar selection is blocked offline and while a photo save is in progress', async () => {
  mockApp.offline = true;
  const view = await render(<Profile />); await fireEvent.press(screen.getByText('Sun'));
  expect(mockMutate).not.toHaveBeenCalled();
  mockApp.offline = false; await view.rerender(<Profile />);
  let finish; request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await selectPhoto(); await screen.findByText('Saving photo…');
  await fireEvent.press(screen.getByText('Sun')); expect(mockMutate).not.toHaveBeenCalled();
  await act(async () => { finish({ data: { image: mockUrl } }); });
  await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));
  expect(mockMutate).toHaveBeenLastCalledWith('/me', 'PATCH', { avatar: 'initials', image: mockUrl });
});
test('pinch zoom and drag affect the confirmed crop without resetting the gesture', async () => {
  const done = jest.fn();
  await render(<PhotoCrop source={{ uri: 'file:///photo.jpg', width: 1200, height: 800 }} onDone={done} onCancel={jest.fn()} />);
  const area = screen.getByTestId('photo-crop-area');
  const size = area.props.style.width;
  let time = 0; let previousPoints = [];
  const event = (points) => {
    const stamp = ++time;
    const value = { nativeEvent: { touches: points.map(([x, y]) => ({ locationX: x, locationY: y, pageX: x, pageY: y })) }, touchHistory: { numberActiveTouches: points.length, indexOfSingleActiveTouch: 0, mostRecentTimeStamp: stamp, touchBank: points.map(([x, y], i) => ({ touchActive: true, currentPageX: x, currentPageY: y, previousPageX: previousPoints[i]?.[0] ?? x, previousPageY: previousPoints[i]?.[1] ?? y, currentTimeStamp: stamp, previousTimeStamp: stamp - 1 })) } };
    previousPoints = points; return value;
  };
  await fireEvent(area, 'responderGrant', event([[size / 2 - 25, size / 2], [size / 2 + 25, size / 2]]), {});
  await fireEvent(area, 'responderMove', event([[size / 2 - 50, size / 2], [size / 2 + 50, size / 2]]), {});
  await fireEvent(area, 'responderMove', event([[size / 2 - 60, size / 2], [size / 2 + 60, size / 2]]), {});
  await fireEvent(area, 'responderEnd', event([[size / 2, size / 2]]), {});
  await fireEvent(area, 'responderMove', event([[size / 2 + size / 10, size / 2]]), {});
  await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(done).toHaveBeenCalledWith(mockDraft));
  const crop = ImageManipulator.manipulate.mock.results[0].value.crop.mock.calls[0][0];
  expect(crop.width).toBe(333); expect(crop.height).toBe(333);
  expect(crop.originX).toBeLessThan(Math.round((1200 - 333) / 2));
  expect(crop.originY).toBeCloseTo((800 - 333) / 2, -1);
});
