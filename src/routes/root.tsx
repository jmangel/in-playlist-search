import { Container, Nav, Navbar } from "react-bootstrap";
import { Link, Outlet, useLocation } from "react-router-dom";

export default function Root() {
  const location = useLocation();

  return (
    <>
      <Navbar bg="light" expand="md">
        <Container>
          <Navbar.Toggle aria-controls="basic-navbar-nav" />
          <Navbar.Collapse id="basic-navbar-nav">
            <Nav variant="underline" activeKey={location.pathname} className="me-auto">
              <Nav.Link as={Link} className="me-2" eventKey="/" to="/">Home</Nav.Link>
              <Nav.Link as={Link} className="me-2" to="mailto:songscaler+dev-feeback-in-playlist-search@gmail.com" target="_blank">Feedback</Nav.Link>
              <Nav.Link as={Link} className="me-2" to="https://venmo.com/u/JohnMangel" target="_blank">Tip The Dev (thanks! ＼(´∀｀)／)</Nav.Link>
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>
      <Outlet />
    </>
  );
}
