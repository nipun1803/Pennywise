import { expoSender, type PushMessage } from '../../src/services/notifications';

const messages: PushMessage[] = [{ to: 'ExponentPushToken[test]', title: 'Test', body: 'Test', data: {}, sound: 'default', channelId: 'default', priority: 'high' }];
afterEach(() => jest.restoreAllMocks());
test('Expo response tickets are validated', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: [{ status: 'ok', id: 'receipt-id' }] })));
  await expect(expoSender(messages)).resolves.toEqual([{ status: 'ok', id: 'receipt-id' }]);
});
test.each([{ data: [] }, {}, { data: [{ status: 'unknown' }] }, { data: [{ status: 'ok' }] }])('malformed Expo responses cannot silently look successful: %j', async body => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body)));
  await expect(expoSender(messages)).rejects.toThrow('invalid push ticket response');
});
test('Expo authorization errors expose the error code, not provider messages containing tokens', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ errors: [{ code: 'UNAUTHORIZED', message: messages[0]!.to }] }), { status: 401 }));
  await expect(expoSender(messages)).rejects.toThrow('Expo push service responded 401 (UNAUTHORIZED)');
});
