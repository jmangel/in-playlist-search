import {
  Dispatch,
  SetStateAction,
  Suspense,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { LoaderResponse } from '../pages/HomePage';
import { Await, useLoaderData } from 'react-router-dom';
import { Button, Col, Form } from 'react-bootstrap';
import { Device, SpotifyApi } from '@spotify/web-api-ts-sdk';

type DeferredDeviceInputProps = {
  selectedDeviceId: string;
  setSelectedDeviceId: Dispatch<SetStateAction<string>>;
};
type DeviceInputProps = DeferredDeviceInputProps & {
  sdk: SpotifyApi;
};
const DeviceInput = (props: DeviceInputProps) => {
  const { selectedDeviceId, setSelectedDeviceId, sdk } = props;

  const [devices, setDevices] = useState([] as Device[]);

  const loadDevices = useCallback(() => {
    sdk?.player
      ?.getAvailableDevices?.()
      ?.then(({ devices }) => setDevices(devices));
  }, [sdk]);

  useEffect(loadDevices, [loadDevices]);

  useEffect(
    () =>
      setSelectedDeviceId(
        (selectedDeviceId) =>
          devices?.find(({ is_active }) => is_active)?.id ||
          selectedDeviceId ||
          ''
      ),
    [devices, setSelectedDeviceId]
  );

  return (
    <div className="d-flex align-items-center">
      <Form.Label className="flex-shrink-0 pr-1 mb-0">Playing on</Form.Label>
      <Form.Select
        className="flex-grow-1 mx-2"
        name="select"
        value={selectedDeviceId}
        onChange={(e) => setSelectedDeviceId(e.target.value)}
      >
        <option value=""></option>
        {devices
          ?.filter(({ id }) => !!id)
          .map(({ name, id }) => (
            <option key={`device-${id}`} value={id!}>
              {name}
            </option>
          ))}
      </Form.Select>
      <Button onClick={loadDevices} className="flex-shrink-0">
        Refresh devices
      </Button>
    </div>
  );
};

const DeferredDeviceInput = (props: DeferredDeviceInputProps) => {
  const { selectedDeviceId, setSelectedDeviceId } = props;
  const { sdk } = useLoaderData() as LoaderResponse;

  return (
    <Suspense fallback={<div>Connecting to spotify...</div>}>
      <Await
        resolve={sdk}
        errorElement={<div>Error connecting to spotify</div>}
      >
        {(sdk) => (
          <Col className="flex-grow-1" xs={6} md={4}>
            <DeviceInput
              selectedDeviceId={selectedDeviceId}
              setSelectedDeviceId={setSelectedDeviceId}
              sdk={sdk}
            />
          </Col>
        )}
      </Await>
    </Suspense>
  );
};

export default DeferredDeviceInput;
