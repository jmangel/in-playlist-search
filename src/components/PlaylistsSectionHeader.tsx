import { Dispatch, SetStateAction } from 'react';
import { Col, Form, Row } from 'react-bootstrap';

const PlaylistsSectionHeader = (props: {
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
}) => {
  const { searchQuery, setSearchQuery } = props;
  return (
    <Row className="d-flex justify-content-start mb-2 align-items-center">
      <Col xs="auto">
        <h1>Your Playlists</h1>
      </Col>
      <Col>
        <Form.Control
          type="text"
          placeholder="Search by song, artist, album, or playlist name or description"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value.toLowerCase())}
        />
      </Col>
    </Row>
  );
};

export default PlaylistsSectionHeader;
