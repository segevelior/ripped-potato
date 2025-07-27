def test_basic_arithmetic():
    """Test that basic arithmetic works correctly."""
    assert 1 + 1 == 2


def test_multiplication():
    """Test that multiplication works correctly."""
    assert 2 * 3 == 6


def test_division():
    """Test that division works correctly."""
    assert 10 / 2 == 5


def test_string_concatenation():
    """Test that string operations work correctly."""
    result = "Hello" + " " + "World"
    assert result == "Hello World" 