import { Await, useLoaderData } from 'react-router-dom';
import { LoaderResponse } from '../pages/HomePage';
import { Suspense } from 'react';
import { Alert } from 'react-bootstrap';

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const DiskUsageAlert = () => {
  const { diskUsageEstimation } = useLoaderData() as LoaderResponse;
  return (
    <Suspense fallback={<></>}>
      <Await resolve={diskUsageEstimation} errorElement={<></>}>
        {(diskUsageEstimation) => {
          if (!diskUsageEstimation) return <></>;

          const { usage, quota } = diskUsageEstimation;
          const usagePercentage = (usage / quota) * 100;

          return (
            <Alert variant="info">
              Cached playlists are using {formatBytes(usage)} on disk,{' '}
              {usagePercentage.toFixed(2)}% of this app's storage quota.
            </Alert>
          );
        }}
      </Await>
    </Suspense>
  );
};

export default DiskUsageAlert;
