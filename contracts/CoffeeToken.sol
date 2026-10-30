// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Token B: everyday small rewards. Fixed supply, no further minting.
contract CoffeeToken is ERC20 {
    constructor() ERC20("Coffee Token", "CAFE") {
        _mint(msg.sender, 100000 * 10 ** decimals());
    }
}
