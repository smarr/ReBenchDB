import { SingleRequestOnly } from "../src/single-requester";

describe('Basic functionality of SingleRequestOnly', () => {

  it('should execute the request on a triggering', async () => {
    let executed = 0;
    const sro = new SingleRequestOnly(async () => { executed += 1; });
    sro.trigger();

    const promise = sro.getQuiescencePromise();
    expect(promise).not.toBeUndefined();

    await promise;

    expect(executed).toEqual(1);
    expect(sro.getQuiescencePromise()).toBeUndefined();
  });

  it('should execute the request once only even if triggered twice in a row', async () => {
    let executed = 0;
    const sro = new SingleRequestOnly(async () => { executed += 1; });

    // Since the request is executed asynchronously, we do execute it only once
    sro.trigger();
    sro.trigger();

    const promise = sro.getQuiescencePromise();
    expect(promise).not.toBeUndefined();

    await promise;

    expect(executed).toEqual(1);
    expect(sro.getQuiescencePromise()).toBeUndefined();
  });

});
