import { UserProfile } from '@spotify/web-api-ts-sdk';
import { LoaderResponse } from '../pages/HomePage';
import { Await, useLoaderData } from 'react-router-dom';
import { Suspense } from 'react';
import { Col } from 'react-bootstrap';

const ProfileInfo = (props: { profile: UserProfile }) => {
  const { profile } = props;
  const { display_name: name, external_urls: { spotify: url = '' } = {} } =
    profile;

  return name ? (
    <h1 className="mb-0">
      Logged in as{' '}
      {url ? (
        <a target="_blank" href={url} rel="noreferrer">
          {name}
        </a>
      ) : (
        name
      )}
    </h1>
  ) : (
    <></>
  );
};

const DeferredProfileInfo = () => {
  const { profile } = useLoaderData() as LoaderResponse;

  return (
    <Suspense fallback={<div>Getting your profile info...</div>}>
      <Await
        resolve={profile}
        errorElement={<div>Error loading your profile</div>}
      >
        {(profile) => (
          <Col xs="auto">
            <ProfileInfo profile={profile} />
          </Col>
        )}
      </Await>
    </Suspense>
  );
};

export default DeferredProfileInfo;
